'use strict';
const axios = require('axios')
const querystring = require('querystring')
const udapCommon = require('hl7-fhir-udap-common')

module.exports.tokenHandler = async (tokenRequestBody, tokenRequestHeaders, dataHolderOrIdpMode) => {
	const tokenEndpoint = dataHolderOrIdpMode == 'dataholder' ? process.env.OAUTH_ORG_VANITY_URL_TOKEN_ENDPOINT : process.env.OAUTH_ORG_VANITY_URL_IDP_TOKEN_ENDPOINT
	var oauthPlatform = null
	
	if(process.env.OAUTH_PLATFORM == 'okta') {
		oauthPlatform = require('./okta/udap_okta')
	}
	else {
		oauthPlatform = require('./auth0/udap_auth0')
	}

	console.log('Token proxy called.')
	console.log('Calling real /token endpoint at OAuth Platform.')

	//Get the proper OAuth /token request based upon the situation.
	const inboundFormData = querystring.parse(tokenRequestBody)

	//If this is a UDAP request, perform additional validation on the request prior to forwarding along.  
	//If not, then we should forward along as-is without the additional validation.
	if(inboundFormData.udap) {
		try {
			console.log("UDAP request found. Validating assertion JWT...")
			const trustAnchor = udapCommon.parseTrustAnchorPEM(process.env.COMMUNITY_CERT)
			await validateJwtAnt(inboundFormData.client_assertion, trustAnchor, dataHolderOrIdpMode)
		}
		catch (ex) {
			console.error(ex)
			var returnBody = {
					'error' : ex.code,
					'error_description': ex.message
			}
			console.error("Return body:",returnBody)
			return {
					//400 - Bad Request
					statusCode: 400,
					body: returnBody
			}
		}
	}

	//At this point we just need to forward along what we have. The extra validation has been performed.
	//Both Okta/Auth0 platforms require some custom HTTP headers when working in proxy mode- so we'll get those here.
	const finalTokenRequestHeaders = oauthPlatform.getTokenProxyHeaders(tokenRequestHeaders)

	try {
		const oauthResponse = await axios.request({
			'url': tokenEndpoint,
			'method': 'POST',
			'headers': finalTokenRequestHeaders,
			'data': tokenRequestBody
		})
		console.log('Response from OAuth Platform:')
		console.log(oauthResponse.data)
			return {
				statusCode: oauthResponse.status,
				body: oauthResponse.data
			}

	}
	catch(error) {
		console.error("Error while calling OAuth Platform:")
		console.error(error)
		if(error.isAxiosError) { //Error from OAuth Platform, or while calling OAuth Platform.
			return {
				statusCode: error.response.status,
				body: error.response.data
			}
		}
		else {
			return {
				statusCode: 500,
				body: 'An unknown error has occurred while validating your client credentials.'
			}
		}
	}
}

async function validateJwtAnt(jwtAnt, caTrustAnchorObject, dataHolderOrIdpMode)
{
	const validationResult = await udapCommon.verifyUdapJwtCommon(jwtAnt, caTrustAnchorObject)
	validateUdapProperties(validationResult.verifiedJwt.body, dataHolderOrIdpMode)
}

function validateUdapProperties(jwtAntBody, dataHolderOrIdpMode)
{
    var error = new Error()
    var d = new Date()
	const expectedAudience = (dataHolderOrIdpMode == 'dataholder' ? process.env.TOKEN_ENDPOINT : process.env.IDP_TOKEN_ENDPOINT)
    error.code = 'invalid_request'
    if (!jwtAntBody.hasOwnProperty('exp') || jwtAntBody.exp == '' ||
    (jwtAntBody.exp*1000 <= d.getTime()) || (jwtAntBody.exp - jwtAntBody.iat)>300)
    {
        error.message = 'Invalid exp value'
        console.error(error)
        throw error
    }
    if (jwtAntBody.hasOwnProperty('client_id') && jwtAntBody.client_id != jwtAntBody.sub)
    {
        error.message = 'Invalid client_id or sub value'
        console.error(error)
        throw error
    }
    console.log("aud: "+ jwtAntBody.aud)
    console.log('expected aud: ' + expectedAudience)
    if (!jwtAntBody.hasOwnProperty('aud') || jwtAntBody.aud  == '' || jwtAntBody.aud != expectedAudience)
    {
        error.message = 'Invalid aud value'
        console.error(error)
        throw error
    }
/* 	if (jwtAntBody.hasOwnProperty('extensions')) 
    {
		var extensions = jwtAntBody.extensions
		if (extensions.hasOwnProperty('hl7-b2b')) {
			var hl7B2BExtension = extensions.getPropertyOf('hl7-b2b')
			if (!hl7B2BExtension.hasOwnProperty('version') || hl7B2BExtension.hasOwnProperty('organization_id') || hl7B2BExtension.hasOwnProperty('purpose_of_use'))
			{
				error.message = 'Invalid hl7-b2b extension'
				console.error(error)
				throw error
			}
		}
		else 
		{
			error.message = 'Invalid hl7-b2b extension'
			console.error(error)
			throw error
		}
	}
	else
	{
		error.message = 'Invalid hl7-b2b extension'
		console.error(error)
		throw error
	} */
}