'use strict'
const fs = require('fs')
const jwk2pem = require('pem-jwk').jwk2pem
const njwt = require('njwt');
const oktaModels = require('./okta_object_models')
const ManagementClient = require('@okta/okta-sdk-nodejs').Client;
const querystring = require('querystring')

//Public methods
//getTokenProxyHeaders
//getAuthorizeProxyDetails
//validateTieredOAuthRequest
//getIdpIdByUri
//createIdp
//createClientApp (create a new app, given inbound udap registration)
//updateClientApp (update an existing app, given inbound udap registration)

//Private Methods
//getAuthzPolicyDetails
//createAuthzPolicy
//updateAuthzPolicy

/*
PRIVATE METHODS
*/
const getAuthzPolicyDetails = async (authorizationServerId, clientId, apiClient) => {
    var policyDetails = {
        "policyId": null,
        "policyRuleId": null
    }

    const policies = await apiClient.authorizationServerApi.listAuthorizationServerPolicies({'authServerId': authorizationServerId})
    await policies.each(policy => {
        if(policy.conditions.clients.include.includes(clientId)) {
            policyDetails.policyId = policy.id
            console.log(`Found a policy matching client id: ${clientId}`)
            console.log(`Found policy: ${policy.id}`)
            return
        }
    })

    if(policyDetails.policyId) {
        const rules = await apiClient.authorizationServerApi.listAuthorizationServerPolicyRules({'authServerId': authorizationServerId, 'policyId': policyDetails.policyId})
        await rules.each(rule => {
            console.log(`Returing first policy rule: ${rule.id}`)
            policyDetails.policyRuleId = rule.id
            return
        })
        return policyDetails
    }

    else { 
        return null
    }
    
}

const createAuthzPolicy = async (authorizationServerId, clientId, grantTypes, scopes, apiClient) => {
    var policyModel = oktaModels.newUdapAppScopePolicyModel
    const requiredScopes = scopes.split(' ').filter((scope) => scope.replace(/\s/g, '').length > 0)

    policyModel.name += '-' + clientId
    policyModel.conditions.clients.include.push(clientId)

    console.log(`Creating authorization server policy: ${policyModel.name}`)

    const createdPolicy = await apiClient.authorizationServerApi.createAuthorizationServerPolicy({authServerId: authorizationServerId, policy: policyModel})

    console.log('Policy Created. Creating rule and adding scopes and grant types.')
    
    var policyRuleModel = oktaModels.newUdapAppScopePolicyRuleModel

    //Ignore all grant types except client credentials and authorization code here. No other grant types are configured at this level.
    policyRuleModel.conditions.grantTypes.include = grantTypes.includes('authorization_code') ? ['authorization_code'] : ['client_credentials']

    policyRuleModel.conditions.scopes.include = requiredScopes

    const createdPolicyRule = await apiClient.authorizationServerApi.createAuthorizationServerPolicyRule({policyId: createdPolicy.id, authServerId: authorizationServerId, policyRule: policyRuleModel})
    
    return {
        createdPolicyId: createdPolicy.id,
        createdPolicyRuleId: createdPolicyRule.id
    }
}

const updateAuthzPolicy = async (authorizationServerId, policyId, policyRuleId, grantTypes, scopes, apiClient) => {
    const requiredScopes = scopes.split(' ')
    var existingPolicyRuleModel = await apiClient.authorizationServerApi.getAuthorizationServerPolicyRule({policyId: policyId, authServerId: authorizationServerId, ruleId: policyRuleId})
    existingPolicyRuleModel.conditions.grantTypes.include = grantTypes.includes('authorization_code') ? ['authorization_code'] : ['client_credentials']
    existingPolicyRuleModel.conditions.scopes.include = requiredScopes
    
    const updatedPolicyRule = await apiClient.authorizationServerApi.replaceAuthorizationServerPolicyRule({policyId: policyId, authServerId: authorizationServerId, ruleId: policyRuleId, policyRule: existingPolicyRuleModel})
    
    return updatedPolicyRule.id
}

/*
PUBLIC METHODS
*/

module.exports.getTokenProxyHeaders = (tokenRequestHeaders) => {
    var updatedHeaders = Object.assign({}, tokenRequestHeaders)
    updatedHeaders.Host = process.env.BASE_DOMAIN
    updatedHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
    return updatedHeaders
}

module.exports.getAuthorizeProxyDetails = (authorizeRequestHeaders,  authorizeRequestQuerystring, idp) => {
    var updatedHeaders = Object.assign({}, authorizeRequestHeaders)
    updatedHeaders.Host = process.env.BASE_DOMAIN

    var updatedQuerystring = Object.assign({}, authorizeRequestQuerystring)
    if(idp) {
        updatedQuerystring.idp = idp
        updatedQuerystring.prompt = 'login'
    }

    return {
        updatedHeaders: updatedHeaders,
        updatedQuerystring: querystring.stringify(updatedQuerystring)
    }
}

module.exports.validateTieredOAuthRequest = (internalIdpData, inboundRequestData) => {

    console.log('Validating the inbound Okta token request...')
    const inboundToken = inboundRequestData.client_assertion
    try {
        const validatedJwt = njwt.verify(inboundToken, jwk2pem(internalIdpData.internal_credentials.public_key), "RS256")
        console.log('Token validated. JWT contents:')
        console.log(validatedJwt)
        //TODO: I'm sure there's a bunch of other checks I want to do here on the JWT.  client_id check, audience check, issuer check, etc.
        //The tiered token client needs the client_id from the inbound request. Perhaps other things down the line.
        return {
            client_id: validatedJwt.body.sub
        }
    }
    catch(error) {
        console.error('A valid JWT was not provided from Okta...')
        console.error(error)
        return false
    }
}

module.exports.getIdpIdByUri = async (idpUri, apiClient) => {
    const oktaResponse = await apiClient.identityProviderApi.listIdentityProviders({queryParams: {q: idpUri}})
    var idpId = null
	console.log('Response from Okta:')
	console.log(oktaResponse)
    await oktaResponse.each(idp => {
        if(idp.name == idpUri) {
            idpId = idp.id
        }
    });
    return idpId
}

//TODO: At time of writing the SDK doesn't support registering private_key_jwt IDPs. Update once support is available.
module.exports.createIdp = async (idpDetail, apiClient) => {
    var idpModel = oktaModels.newUdapIdpModel
    idpModel.name = idpDetail.idpUri
    idpModel.protocol.endpoints.authorization.url = idpDetail.authorizeUrl
    idpModel.protocol.endpoints.token.url = idpDetail.tokenUrl
    idpModel.protocol.endpoints.userInfo.url = idpDetail.userInfoUrl
    idpModel.protocol.endpoints.jwks.url = idpDetail.jwksUrl
    idpModel.protocol.credentials.client.client_id = idpDetail.clientId
    idpModel.protocol.issuer.url = idpDetail.idpIssuer

	console.log("Invoking the Okta idps endpoint to create the IDP endpoint.")
    console.log("IDP Model:")
    console.log(JSON.stringify(idpModel))
    const createRequest = {
        method: 'POST',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify(idpModel)
    }
    const createUrl = `${apiClient.baseUrl}/api/v1/idps`;
    const httpCreateResponse = await apiClient.http.http(createUrl, createRequest)
    //var createResponse = await apiClient.identityProviderApi.createIdentityProvider({identityProvider: idpModel})
	
    var createResponse = await httpCreateResponse.json()
	console.log('Create Response from Okta:')
	console.log(createResponse)
    
	const idpId = createResponse.id
	const publicKeyId = createResponse.protocol.credentials.signing.kid

    delete createResponse.id
    delete createResponse.created
    delete createResponse.lastUpdated

    //Getting the public key generated by Okta...
	console.log("Invoking the Okta idp credential endpoint to get the public key generated by Okta.")
    const keysResponse = await apiClient.identityProviderApi.getIdentityProviderSigningKey({idpId: idpId, keyId: publicKeyId})
	
	console.log('Get Response from Okta:')
	console.log(keysResponse)
	const publicKey = keysResponse

	console.log("Updating the token endpoint on the IDP to the proper outbound proxy URL.")
	createResponse.protocol.endpoints.token.url = "https://" + process.env.BASE_DOMAIN + "/" + idpId + "/tiered_client/token"
    //const updateResponse = await apiClient.identityProviderApi.replaceIdentityProvider({idpId: idpId, identityProvider: createResponse})
	
    const updateRequest = {
        method: 'PUT',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify(createResponse)
    }
    const updateUrl = `${apiClient.baseUrl}/api/v1/idps/${idpId}`;
    const httpUpdateResponse = await apiClient.http.http(updateUrl, updateRequest)

    const updateResponse = await httpUpdateResponse.json()
	console.log('Update Response from Okta:')
	console.log(updateResponse)

    return {
        idpId: idpId,
        internalCredentials: {public_key: publicKey}
    }
}

//TODO: Error handling.
module.exports.updateClientApp = async (clientId, ssVerifiedJwtObject, verifiedJwtJwks, apiClient) => {
    //GET
    //UPDATE
    //PUT
    
    var updatedApp = await module.exports.getApp(clientId, apiClient)

    const oldAppType = updatedApp.settings.oauthClient.application_type
    const newAppType = (ssVerifiedJwtObject.body.grant_types.includes('authorization_code') ? 'web' : 'service')

    if(oldAppType != newAppType) {
        var err = new Error('This server does not support editing between client_credentials and authorization_code grants. Please submit a delete request and a create request to obtain a new client_id.')
        err.code = 'invalid_registration_edit'
        throw err
    }

    updatedApp.label = ssVerifiedJwtObject.body.client_name
    updatedApp.settings.oauthClient.redirect_uris = ssVerifiedJwtObject.body.redirect_uris
    updatedApp.settings.oauthClient.response_types = ssVerifiedJwtObject.body.response_types
    updatedApp.settings.oauthClient.jwks = verifiedJwtJwks
    updatedApp.settings.oauthClient.grant_types = ssVerifiedJwtObject.body.grant_types
    updatedApp.settings.oauthClient.logo_uri = ssVerifiedJwtObject.body.hasOwnProperty('logo_uri') ? ssVerifiedJwtObject.body.logo_uri : ''

    console.log("Body to send to Okta Client Registration")
    console.log(JSON.stringify(updatedApp))

    const updateResponse = await apiClient.applicationApi.replaceApplication({appId: clientId, application: updatedApp})
    console.log('Update Response from Okta:')
	console.log(updateResponse)

    console.log('Updating scopes and grant types...')

    console.log('Finding an existing policy for this client id.')
    const policyDetails = await getAuthzPolicyDetails(process.env.OAUTH_RESOURCE_SERVER_ID, clientId, apiClient)

    if(policyDetails) {
        console.log('An existing authorization policy was found. Uppdating...')
        await updateAuthzPolicy(process.env.OAUTH_RESOURCE_SERVER_ID, policyDetails.policyId, policyDetails.policyRuleId, ssVerifiedJwtObject.body.grant_types, ssVerifiedJwtObject.body.scope, apiClient)
    }
    else {
        console.log('No authorization policy was found for this application. Creating...')
        await createAuthzPolicy(process.env.OAUTH_RESOURCE_SERVER_ID, clientId, ssVerifiedJwtObject.body.grant_types, ssVerifiedJwtObject.body.scope, apiClient)
    }

    return updateResponse.credentials.oauthClient.client_id
}

module.exports.getApp = async (clientId, apiClient) => {
    const getResponse = await apiClient.applicationApi.getApplication({appId: clientId, queryParams: null})
    console.log('GetApp Response from Okta:')
    console.log(getResponse)
    return getResponse
}

module.exports.createClientApp = async (ssVerifiedJwtObject, verifiedJwtJwks, apiClient) => {
    var newApp = oktaModels.newUdapAppModel
    try {
        newApp.label = ssVerifiedJwtObject.body.client_name
        newApp.settings.oauthClient.redirect_uris = ssVerifiedJwtObject.body.redirect_uris
        newApp.settings.oauthClient.response_types = ssVerifiedJwtObject.body.response_types
        newApp.settings.oauthClient.jwks = verifiedJwtJwks
        newApp.settings.oauthClient.grant_types = ssVerifiedJwtObject.body.grant_types
        newApp.settings.oauthClient.application_type = (ssVerifiedJwtObject.body.grant_types.includes('authorization_code') ? 'web' : 'service')
        newApp.settings.oauthClient.logo_uri = ssVerifiedJwtObject.body.hasOwnProperty('logo_uri') ? ssVerifiedJwtObject.body.logo_uri : ''

        console.log("Body to send to Okta Client Registration")
        console.log(JSON.stringify(newApp))

        var createResponse = await apiClient.applicationApi.createApplication({application: newApp, queryParams: {"activate": true}})

        console.log('Create Response from Okta:')
        console.log(createResponse)

        console.log('Creating an authorization server policy for the new application...')
        const policyDetails = await createAuthzPolicy(process.env.OAUTH_RESOURCE_SERVER_ID, createResponse.credentials.oauthClient.client_id, ssVerifiedJwtObject.body.grant_types, ssVerifiedJwtObject.body.scope, apiClient)

        console.log('Policy created. Details:')
        console.log(policyDetails)

        return createResponse.credentials.oauthClient.client_id
    }
    catch (error) {
        //TODO: Do I have anything new to add here other than logging?
        console.error("Error while registering with Okta:")
        console.error(error)
        throw error
    }
}

module.exports.deleteClientApp = async (clientId, apiClient) => {
    try {

        const policyDetails = await getAuthzPolicyDetails(process.env.OAUTH_RESOURCE_SERVER_ID, clientId, apiClient)
        if(policyDetails) {
            console.log('An authorization policy was found for this application. Cleaning up...')
            await apiClient.authorizationServerApi.deleteAuthorizationServerPolicy({policyId: policyDetails.policyId, authServerId: process.env.OAUTH_RESOURCE_SERVER_ID})
        }

        const disableResponse = await apiClient.applicationApi.deactivateApplication({appId: clientId})
        console.log('Deactivate response from Okta:')
        console.log(disableResponse)

        const deleteResponse = await apiClient.applicationApi.deleteApplication({appId: clientId})
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

module.exports.getAPIClient = (oktaOrg, clientId, privateKeyFile) => {
    const signingKeyPem = fs.readFileSync(privateKeyFile, 'utf8')
    console.log(signingKeyPem)

    const options = {
        orgUrl: 'https://' + oktaOrg,
        authorizationMode: 'PrivateKey',
        clientId: clientId,
        privateKey: signingKeyPem,
        scopes: ['okta.apps.manage','okta.apps.read','okta.idps.read','okta.idps.manage', 'okta.authorizationServers.read', 'okta.authorizationServers.manage']
    }

    return new ManagementClient(options)
}

