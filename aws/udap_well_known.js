'use strict';
const udapWellKnownLib = require('../lib/udap_well_known')

//Metadata endpoints - AWS Lambda Interface
module.exports.udapConfigHandler = async (event, context) => {
	var udapConfigResult = await udapWellKnownLib.getUDAPConfiguration()
	return {
		statusCode: udapConfigResult.statusCode,
		body: JSON.stringify(udapConfigResult.body),
		headers: {
			'Access-Control-Allow-Origin': '*', // CORS
			'Access-Control-Allow-Credentials': false // Required for cookies, authorization headers with HTTPS
		}
	}
}