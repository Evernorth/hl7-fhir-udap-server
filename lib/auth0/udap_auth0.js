'use strict'
const fs = require('fs')
const jwk2pem = require('pem-jwk').jwk2pem
const ManagementClient = require('auth0').ManagementClient;
const querystring = require('querystring')
const auth0Models = require('./auth0_object_models')

//Auth0 Specific
module.exports.getTokenProxyHeaders = (tokenRequestHeaders) => {
    var updatedHeaders = Object.assign({}, tokenRequestHeaders)
    updatedHeaders['cname-api-key'] = process.env.OKTA_ORG_VANITY_URL_APIKEY
    updatedHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
    updatedHeaders['Host'] = process.env.OKTA_CUSTOM_DOMAIN_NAME_BACKEND
    return updatedHeaders
}

module.exports.getAuthorizeProxyDetails = (authorizeRequestHeaders,  authorizeRequestQuerystring, idp) => {
    var updatedHeaders = Object.assign({}, authorizeRequestHeaders)
    updatedHeaders['cname-api-key'] = process.env.OKTA_ORG_VANITY_URL_APIKEY
    updatedHeaders['Host'] = process.env.OKTA_CUSTOM_DOMAIN_NAME_BACKEND

    var updatedQuerystring = Object.assign({}, authorizeRequestQuerystring)
    if(idp) {
        updatedQuerystring.connection = idp
        updatedQuerystring.prompt = 'login'
    }

    return {
        updatedHeaders: updatedHeaders,
        updatedQuerystring: querystring.stringify(updatedQuerystring)
    }
}

module.exports.validateTieredOAuthRequest = (internalIdpData, tokenRequestBody) => {
    console.log('Validating inbound token request from auth0...')
    if(tokenRequestBody.client_id == internalIdpData.internal_credentials.client_id && tokenRequestBody.client_secret == internalIdpData.internal_credentials.client_secret) {
        return {
            client_id: tokenRequestBody.client_id
        }
    }
    else {
        var error = new Error()
        error.code = 'invalid_client_authentication'
        error.message = 'Invalid client authentication from Okta.'
        console.error(error)
        throw error
    }
}

module.exports.getIdpIdByUri = async (idpUri, apiClient) => {
	var params = {
        per_page: 10,
        page: 0
    };
      
    const connections = await apiClient.connections.getAll(params)
    console.log("Response from Okta:")
    console.log(connections)

    const foundConnection = connections.filter(connection => connection.display_name == idpUri)

    console.log("Connections that match the idpUri passed in:")
    console.log(foundConnection)

    if(foundConnection.length > 0) {
        return foundConnection[0].id
    }
    else {
        return null
    }
}

//TODO: Once I start testing I need to generate real values for everything.
module.exports.createIdp = async (idpDetail, apiClient) => {
    var idpModel = auth0Models.newUdapIdpModel

    idpModel.name = 'GENERATE'
    idpModel.display_name = idpDetail.idpUri
    idpModel.options.authorizationURL = idpDetail.authorizeUrl
    idpModel.options.tokenURL = 'https://localhost'
    idpModel.options.jwks.url = ''
    idpModel.options.client_id = 'GENERATE'
    idpModel.options.client_secret = 'GENERATE'
    idpModel.issuer.url = ''

	console.log("Invoking the Okta idps endpoint to create the IDP endpoint.")
    var newConnection = await apiClient.connections.create(idpModel)

	console.log('Response from Okta:')
	console.log(JSON.stringify(newConnection))

	const idpId = newConnection.id

	console.log("Updating the token endpoint on the IDP to the proper outbound proxy URL.")
	newConnection.options.tokenURL = "https://" + process.env.BASE_DOMAIN + "/" + idpId + "/tiered_client/token"
	const updatedConnection = await apiClient.connections.update(newConnection)

	console.log('Response from Okta:')
	console.log(JSON.stringify(updatedConnection))

    return {
        idpId: idpId,
        internalCredentials: {client_id: 'GENERATE', client_secret: 'GENERATE'}
    }
}

module.exports.updateClientApp = async (clientId, ssVerifiedJwtObject, verifiedJwtJwks, apiClient) => {
    var updatedApp = await module.exports.getApp(clientId, apiClient)

    const oldAppType = updatedApp.app_type
    const newAppType = (ssVerifiedJwtObject.body.grant_types.includes('authorization_code') ? 'regular_web' : 'non_interactive')

    if(oldAppType != newAppType) {
        var err = new Error('This server does not support editing between client_credentials and authorization_code grants. Please submit a delete request and a create request to obtain a new client_id.')
        err.code = 'invalid_registration_edit'
        throw err
    }

    updatedApp.name = ssVerifiedJwtObject.body.client_name
    updatedApp.callbacks = ssVerifiedJwtObject.body.redirect_uris
    updatedApp.client_authentication_methods.private_key_jwt.credentials.push(verifiedJwtJwks)
    updatedApp.grant_types = ssVerifiedJwtObject.body.grant_types
    updatedApp.logo_uri = ssVerifiedJwtObject.body.hasOwnProperty('logo_uri') ? ssVerifiedJwtObject.body.logo_uri : ''

    const cleansedAppUpdate = module.exports.cleanseAppForUpdate(updatedApp)

    console.log("Body to send to Okta Client Registration for update")
    console.log(JSON.stringify(cleansedAppUpdate))

	const updateResponse = await apiClient.clients.update({client_id: clientId}, cleansedAppUpdate)
    console.log('Response from Okta:')
	console.log(JSON.stringify(updateResponse))

    return updateResponse.client_id
}

module.exports.getApp = async (clientId, apiClient) => {
    console.log(`Getting client id: ${clientId}`)
    const app = await apiClient.clients.get({ client_id: clientId })
	console.log('App Response from Okta:')
	console.log(JSON.stringify(app))

    return app
}

module.exports.createClientApp = async (ssVerifiedJwtObject, verifiedJwtJwks, apiClient) => {
    var newApp = auth0Models.newUdapAppModel
    newApp.client_authentication_methods.private_key_jwt.credentials = []

    newApp.name = ssVerifiedJwtObject.body.client_name
    newApp.callbacks = ssVerifiedJwtObject.body.redirect_uris
    newApp.grant_types = ssVerifiedJwtObject.body.grant_types
    newApp.app_type = (ssVerifiedJwtObject.body.grant_types.includes('authorization_code') ? 'regular_web' : 'non_interactive')
    newApp.logo_uri = ssVerifiedJwtObject.body.hasOwnProperty('logo_uri') ? ssVerifiedJwtObject.body.logo_uri : ''

    var newAppCredential = auth0Models.newUdapAppCredential
    newAppCredential.name = ssVerifiedJwtObject.body.client_name
    newAppCredential.pem = jwk2pem(verifiedJwtJwks.keys[0])

    newApp.client_authentication_methods.private_key_jwt.credentials.push(newAppCredential)

    console.log("App to send to Okta Client Registration")
    console.log(JSON.stringify(newApp))

    var createdApp = await apiClient.clients.create(newApp)
    console.log('Response from Okta:')
    console.log(JSON.stringify(createdApp))

    return createdApp.client_id
}

module.exports.deleteClientApp = async (clientId, apiClient) => {
    try {
        const deleteResponse = await apiClient.clients.delete({client_id: clientId})
        console.log('Delete response from Okta:')
        console.log(deleteResponse)
    }
    catch (error) {
        //TODO: Do I have anything new to add here other than logging?
        console.error("Error while deleting registration with Okta:")
        console.error(error)
        throw error
    }
}

module.exports.cleanseAppForUpdate = (appObject) => {
    delete appObject.callback_url_template
    delete appObject.client_id
    delete appObject.signing_keys
    delete appObject.encrypted
    delete appObject.global
    delete appObject.tenant
    delete appObject.jwt_configuration.secret_encoded

    var credentialId = null
    for(var i=0; i< appObject.client_authentication_methods.private_key_jwt.credentials.length; i++) {
        if(appObject.client_authentication_methods.private_key_jwt.credentials[i].id) {
            credentialId = appObject.client_authentication_methods.private_key_jwt.credentials[i].id
        }
    }

    appObject.client_authentication_methods.private_key_jwt.credentials = [{id: credentialId}]

    return appObject
}

module.exports.getAPIClient = (oktaOrg, clientId, privateKeyFile) => {
    const signingKeyPem = fs.readFileSync(privateKeyFile, 'utf8')

    const options = {
        domain: oktaOrg,
        clientId: clientId,
        clientAssertionSigningKey: signingKeyPem,
        scope: "read:clients create:clients update:clients delete:clients read:connections create:connections update:connections create:client_credentials update:client_credentials"
    }

    return new ManagementClient(options)
}