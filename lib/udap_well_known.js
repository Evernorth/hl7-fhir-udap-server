'use strict';
const fs = require('fs')
const udapCommon = require('hl7-fhir-udap-common')
const axios = require('axios')

//Added to handle UDAP meta data
module.exports.getUDAPConfiguration = () => {
	try {
		//TODO:  This needs to handle communities handle community query parameter
		//TODO: I'm assuming that the P12 file only has one private/public key pair. Perhaps there should be a config variable to pick which entry.
		const certAndPrivateKey = udapCommon.parsePKCS12(process.env.SERVER_KEY, process.env.SERVER_KEY_PWD)
		const serverCertAndKey = getCertificateBySAN(certAndPrivateKey, process.env.IDP_SERVER_SAN)

		if(serverCertAndKey) {
			const claims = {
				iss: process.env.IDP_SERVER_SAN,
				sub: process.env.IDP_SERVER_SAN,
				authorize_endpoint: process.env.IDP_AUTHORIZE_ENDPOINT,
				token_endpoint: process.env.IDP_TOKEN_ENDPOINT,
				registration_endpoint: process.env.IDP_REGISTRATION_ENDPOINT
			}
			return {
				"statusCode": 200,
				"body": {
					"udap_versions_supported": ["1"],
					"udap_profiles_supported": ["udap_dcr", "udap_authn", "udap_authz", "udap_to"],
					"udap_authorization_extensions_supported": [],
					"udap_authorization_extensions_required": [],
					"udap_certifications_supported": [],
					"udap_certifications_required": [],
					"grant_types_supported": ["authorization_code", "refresh_token",  "client_credentials"],
					"scopes_supported": ["openid", "fhirUser", "email", "profile","udap"],
					"registration_endpoint": claims.registration_endpoint,
					"registration_endpoint_jwt_signing_alg_values_supported": [process.env.IDP_SIGNING_ALGORITHM],
					"authorization_endpoint" : claims.authorize_endpoint,
					"token_endpoint":  claims.token_endpoint,
					"token_endpoint_auth_signing_alg_values_supported":[process.env.IDP_SIGNING_ALGORITHM],
					"token_endpoint_auth_methods_supported": ["private_key_jwt"],
					"signed_metadata": getSignedEndpointsJWT(serverCertAndKey, claims)
				}
			}
		}
		else {
			return {"statusCode": 500, "body": {"error": "The SAN configured to be used for IDP purposes does not exist within any of the certificates provided."}}
		}
	}
	catch(error) {
		console.error(error)
		return {"statusCode": 500, "body": {"error": "An unknown error has occurred while generating the UDAP metadata content."}}
	}
}

module.exports.getFHIRServerWellKnown = async () => {
	const udapMetaResponse = await axios.request({
		'url': `${process.env.FHIR_BASE_URL}/.well-known/udap`,
		'method': 'GET',
		'headers': {'Content-Type': 'application/fhir+json'},
	})
	
	return udapMetaResponse.data
}

function getSignedEndpointsJWT(certAndPrivateKey, signedMetaclaims) {
	const claims = {
		"iss": signedMetaclaims.iss,
		"sub": signedMetaclaims.sub,
		"authorization_endpoint": signedMetaclaims.authorize_endpoint,
		"token_endpoint": signedMetaclaims.token_endpoint,
		"registration_endpoint": signedMetaclaims.registration_endpoint
	}
	return udapCommon.generateUdapSignedJwt(claims, certAndPrivateKey, process.env.IDP_SIGNING_ALGORITHM)
}

function getCertificateBySAN(certArray, san) {
	for(var i=0; i<certArray.length; i++) {
		if(udapCommon.validateSanInCert(san, certArray[i].certChain[0])) {
			return certArray[i]
		}
	}
	return null
}