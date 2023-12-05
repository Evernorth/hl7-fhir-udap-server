'use strict';

const querystring = require('querystring')
const udapClient = require('hl7-fhir-udap-client')

var oauthPlatform = null

module.exports.tieredTokenClientHandler = async (tokenRequestBody, internalIdpData) => {
	console.log('UDAP Tiered OAuth token client called.')
	if(process.env.OAUTH_PLATFORM == 'okta') {
		oauthPlatform = require('./oauth/udap_okta')
	}
	else {
		oauthPlatform = require('./auth0/udap_auth0')
	}

	console.log('Validating the inbound OAuth request...')
	const inboundRequestData = querystring.parse(tokenRequestBody)

	//For Auth0 this will be client id and secret.  For Okta, this will be private key jwt.
	const validatedRequestData = oauthPlatform.validateTieredOAuthRequest(internalIdpData, inboundRequestData)

	if(validatedRequestData) {
		try {
			console.log("Inbound OAuth request verified! Making UDAP token request to the real endpoint...")
			const client = new udapClient(process.env.SERVER_KEY, process.env.SERVER_KEY_PWD, process.env.COMMUNITY_CERT, validatedRequestData.client_id, internalIdpData.idp_base_url, 'organization_id', 'organization_name', 'purpose_of_use')

			const tokenResponse = await client.udapTokenRequestAuthCode(inboundRequestData.code, inboundRequestData.redirect_uri)

			console.log('Response from IDP:')
			console.log(tokenResponse.data)
			return {
				statusCode: tokenResponse.status,
				body: tokenResponse.data
			}
		}
		catch(error) {
			return {
				statusCode: 500,
				body: 'Unable to perform tiered-oauth with the upstream IDP. Please check internal logs for further detail.'
			}
		}
	}
	else {
		return {
			statusCode: 500,
			body: 'Unable to validate UDAP tiered-oauth client credentials. Ensure they are configured properly on the data holder\'s authorization server.'
		}
	}
}