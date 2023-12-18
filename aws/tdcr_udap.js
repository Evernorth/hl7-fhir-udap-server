'use strict';
const tdcr_udapLib = require('../lib/tdcr_udap')
const AWS = require('aws-sdk');
AWS.config.update({
	region: process.env.AWS_REGION
})
const dynamoDB = new AWS.DynamoDB.DocumentClient()

//UDAP Trusted Dynamic Client Registration Proxy for OAuth application registration
module.exports.clientRegistrationHandler = async (event, context) => {
    var returnStatus = '400';
    var clientId = null
    var oauthPlatform = null
    
	if(process.env.OAUTH_PLATFORM == 'okta') {
		oauthPlatform = require('../lib/okta/udap_okta')
	}
	else {
		oauthPlatform = require('../lib/auth0/udap_auth0')
	}
    const oauthPlatformManagementClient = oauthPlatform.getAPIClient(process.env.OAUTH_ORG, process.env.OAUTH_CLIENT_ID, process.env.OAUTH_PRIVATE_KEY_FILE) 

    var validatedRegistrationData = await tdcr_udapLib.validateUdapCommonRegistrationRequest(event.body)

    if(validatedRegistrationData.verifiedJwt) {
        try {
            const result = await checkSanRegistry(validatedRegistrationData.subjectAlternativeName)

            console.log("Registration request validated.")
            if (result == null) {
                //new registration

                await tdcr_udapLib.validateClientRegistrationMetaData(validatedRegistrationData.verifiedJwt, false)
                clientId = await oauthPlatform.createClientApp(validatedRegistrationData.verifiedJwt, validatedRegistrationData.verifiedJwtJwks, oauthPlatformManagementClient)
                //TODO:  Scope handling needs to happen somewhere in here.
                await updateSanRegistry(validatedRegistrationData.subjectAlternativeName, clientId)
                returnStatus = '201'
            }
            else if(validatedRegistrationData.verifiedJwt.body.grant_types.length > 0) {
                //update/edit registration

                await tdcr_udapLib.validateClientRegistrationMetaData(validatedRegistrationData.verifiedJwt, true)
                
                clientId = result.client_application_id
                //TODO:  Scope handling needs to happen somewhere in here.
                await oauthPlatform.updateClientApp(result.client_application_id, validatedRegistrationData.verifiedJwt, validatedRegistrationData.verifiedJwtJwks, oauthPlatformManagementClient)
                returnStatus = '200'
            }
            else {
                //No grant types given - delete registration.
                clientId = result.client_application_id
                await oauthPlatform.deleteClientApp(result.client_application_id, oauthPlatformManagementClient)
                await deleteSanRegistry(validatedRegistrationData.subjectAlternativeName)

                returnStatus = '204'
            }
            
            //TODO: does this merge work if we change scopes?  e.g. do not return what was requested which is what happens today.
            //software statement asks for system/.* we return that even though we advertise much less.
            const dcrReturnBody = {
                "client_id": clientId,
                "software_statement": validatedRegistrationData.inboundSoftwareStatement,
                ...validatedRegistrationData.verifiedJwt.body  //merge in the details from the validated software statement JWT.
            }

            console.log("Return to Client Body:")
            console.log(dcrReturnBody)

            return {
                statusCode: returnStatus,
                body: JSON.stringify(dcrReturnBody),
                headers: {"Cache-Control": "no-store", "Pragma": "no-cache"}
            }
        }
        catch(error) {
            console.error(error)
            if(error.code && error.message) {
                const returnBody = {
                    'error' : error.code,
                    'error_description': error.message
                }
                return {
                    statusCode: 400,
                    body: JSON.stringify(returnBody),
                    headers: {"Cache-Control": "no-store", "Pragma": "no-cache"}
                }
            }
            else {
                return {
                    statusCode: 500,
                    body: 'An unknown error occurred while processing your dynamic client registration request.'
                }
            }
        }
    }
    else {
        return {
            statusCode: validatedRegistrationData.statusCode,
            body: JSON.stringify(validatedRegistrationData.body)
        }
    }
}

async function updateSanRegistry(subjectAlternativeName, clientAppId)
{
	console.log('New Client Registered storing appId in DB')
	console.log('Item to put in the DB:')
	console.log("SAN: " + subjectAlternativeName, " ClientAppId: ", clientAppId)
	const result = await dynamoDB.put({
		TableName: process.env.SAN_REGISTRY_TABLE_NAME,
		Item: {
            subject_alternative_name: subjectAlternativeName,
			client_application_id: clientAppId
		}
	}).promise()
	console.log("Dynamo Put result: " + result)
}

async function checkSanRegistry(subjectAlternativeName)
{
	console.log('Checking SAN Registry to see if this is existing registered app')
	console.log('SAN to lookup:')
	console.log(subjectAlternativeName)
	const result = await dynamoDB.get({
		TableName: process.env.SAN_REGISTRY_TABLE_NAME,
		Key: {
            subject_alternative_name: subjectAlternativeName
        }
	}).promise()
    console.log("SAN Registry Item:")
    console.log(result.Item)
    if(result.Item) {
        return result.Item
    }
    else {
        return null
    }
}

async function deleteSanRegistry(subjectAlternativeName)
{
	console.log('SAN to delete:')
	console.log(subjectAlternativeName)
	await dynamoDB.delete({
		TableName: process.env.SAN_REGISTRY_TABLE_NAME,
		Key: {
            subject_alternative_name: subjectAlternativeName
        }
	}).promise()
}