'use strict';
const axios = require('axios')
const udapClient = require('hl7-fhir-udap-client'); 
const udapCommon = require('hl7-fhir-udap-common');

//Look up IDP by URL from OAuth Platform in the IDP list (maybe a cache or something too)

//If found, simply forward the request on to OAuth Platform, replacing the URL with the IDP ID.

//If NOT found, retrieve the UDAP metadata from the IDP, and validate.  If valid, then create a new IDP in OAuth Platform, and then forward the request on to Auth.
module.exports.authorizeHandler = async (requestQuerystring, requestHeaders, dataHolderOrIdpMode) => {
	const idpUri = requestQuerystring.idp
	const scopes = requestQuerystring.scope
	const backendAuthorizeUrl = (dataHolderOrIdpMode == 'dataholder' ? process.env.OAUTH_ORG_VANITY_URL_AUTHORIZE_ENDPOINT : process.env.OAUTH_ORG_VANITY_URL_IDP_AUTHORIZE_ENDPOINT)
	var oauthPlatform = null

	if(process.env.OAUTH_PLATFORM == 'okta') {
		oauthPlatform = require('./okta/udap_okta')
	}
	else {
		oauthPlatform = require('./auth0/udap_auth0')
	}

	//First, validate if the IDP is in our trust community
	//First let's see if this is a tiered oauth request.
	//If idp parameter is passed, and udap scope is requested, then it's tiered oauth.
	//We're also going to completely ignore this if we're already processing this request as the IDP.  Not allowing multiple tiered oauth chains now.
	if(idpUri && scopes && scopes.split(" ").includes("udap") && dataHolderOrIdpMode == 'dataholder') {
		console.log("Tiered-OAuth request found.")
		const oauthPlatformManagementClient = oauthPlatform.getAPIClient(process.env.OAUTH_ORG, process.env.OAUTH_CLIENT_ID, process.env.OAUTH_PRIVATE_KEY_FILE)
		const client = new udapClient(process.env.SERVER_KEY, process.env.SERVER_KEY_PWD, process.env.COMMUNITY_CERT, null, idpUri, process.env.ORGANIZATION_ID, process.env.ORGANIZATION_NAME, process.env.PURPOSE_OF_USE)
		
		try {
			await client.getAndValidateUdapMetadata(`${idpUri}/.well-known/udap`)
		}
		catch(error) {
			return {
				statusCode: 400,
				body: {
					'error': 'invalid_idp',
					'error_description': error.message
				}
			}
		}
		var finalIDPId = null
		
		console.log("URI is valid and belongs to our trust community.")
		try {
			const oauthIDPId = await oauthPlatform.getIdpIdByUri(idpUri, oauthPlatformManagementClient)
			var newIDPInfo = null
			//If OAuth Platform doesn't know this IDP yet, we need to register.
			if(!oauthIDPId) {
				console.log("No IDP found in OAuth Platform- registering.")
				console.log("Getting additional OIDC metadata.")
				const oidcMetadata = await readOIDCConfiguration(idpUri)

				const oauthIDPInfo = await registerOAuthIDP(idpUri, client, oidcMetadata, oauthPlatform, oauthPlatformManagementClient)
				newIDPInfo = oauthIDPInfo.newIdpMapping
				finalIDPId = oauthIDPInfo.idpId
			}
			else {
				finalIDPId = oauthIDPId
			}

			const authorizeProxyDetails = oauthPlatform.getAuthorizeProxyDetails(requestHeaders,  requestQuerystring, finalIDPId)

			console.debug("Final /authorize parameters: ")
			console.debug(authorizeProxyDetails)

			var oauthResult = await axios.request({
				'url': backendAuthorizeUrl + "?" + authorizeProxyDetails.updatedQuerystring,
				'method': 'GET',
				'headers': authorizeProxyDetails.updatedHeaders,
				'maxRedirects': 0,
				'validateStatus': function (status) {
				return true //We want to report on exactly what the OAuth Platform reports back, good or bad.
				}
			})
			return {
				statusCode: oauthResult.status,
				headers: oauthResult.headers,
				body: oauthResult.data,
				newIdpMapping: newIDPInfo
			}
		}
		catch(error) {
			console.error(error)
			return {
				statusCode: 400,
				body: {
					'error': 'unable_to_register',
					'error_description': 'Unable to register ourselves with the upstream IDP.'
				}
			}
		}
	}
	else {
		console.log("Non-Tiered-OAuth request found.")

		//Normal OAuth2 flow stuff. No tiered oauth. At this point we're just proxying through.
		const authorizeProxyDetails = oauthPlatform.getAuthorizeProxyDetails(requestHeaders, requestQuerystring, null)

		var oauthResult = await axios.request({
			'url': `${backendAuthorizeUrl}?${authorizeProxyDetails.updatedQuerystring}`,
			'method': 'GET',
			'headers': authorizeProxyDetails.updatedHeaders,
			'maxRedirects': 0,
			'validateStatus': function (status) {
  				return true
			}
		})
		return {
			statusCode: oauthResult.status,
			headers: oauthResult.headers,
			body: oauthResult.data,
		}
	}
}

async function readOIDCConfiguration(idpBaseUrl) {
	const oidcWellKnownEndpoint = idpBaseUrl + '/.well-known/openid-configuration'
	console.log("Looking for OIDC metadata at: " + oidcWellKnownEndpoint)
	const idpResponse = await axios.request({
		'url': oidcWellKnownEndpoint,
		'method': 'GET',
		'headers': {
			'Accept': 'application/json',
			'Content-Type': 'application/json'
		}
	})

	console.log('OIDC metadata found!')
	console.log(JSON.stringify(idpResponse.data))
	return idpResponse.data
}

async function registerOAuthIDP(idpUri, udapClient, oidcMetadata, oauthPlatform, oauthPlatformManagementClient) {
	//TODO: Need to make these config variables.
	const authzCodeRegistrationObject = {
	  client_name: "Tiered OAuth Test Data Holder",
	  contacts: ["test.user@testco.com"],
	  grant_types: ['authorization_code'],
	  response_types: ['code'],
	  redirect_uris: [process.env.TIERED_OAUTH_REDIRECT_ENDPOINT],
	  logo_uri:process.env.LOGO_URI,
	  scope: "fhirUser udap openid email profile",
	  san: process.env.SERVER_SAN
	}

	console.log("Performing dynamic client registration with the IDP!")
	const externalIdpData = await udapClient.udapDynamicClientRegistration(authzCodeRegistrationObject)

	console.log("Registration result:")
	console.log(externalIdpData)

	console.log("Using the following OIDC metadata:")
	console.log(JSON.stringify(oidcMetadata))

	console.log("Invoking the OAuth Platform API to create the IDP...")
	const idpDetail = {
		idpUri: idpUri,
		authorizeUrl: udapClient.signedMetadata.authorization_endpoint,
		tokenUrl: udapClient.signedMetadata.token_endpoint,
		userInfoUrl: oidcMetadata.userinfo_endpoint,
		jwksUrl: oidcMetadata.jwks_uri,
		clientId: externalIdpData.data.client_id,
		idpIssuer: oidcMetadata.issuer,
		scope: authzCodeRegistrationObject.scope
	}

	const oauthIdpDetail = await oauthPlatform.createIdp(idpDetail, oauthPlatformManagementClient)

	console.log('Response from OAuth Platform')
	console.log(oauthIdpDetail)

	return {
		idpId: oauthIdpDetail.idpId,
		newIdpMapping: {
			idp_id: oauthIdpDetail.idpId,
			idp_base_url: idpUri,
			internal_credentials: oauthIdpDetail.internalCredentials
		}
	}
}
