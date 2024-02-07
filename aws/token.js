'use strict';
const tokenLib = require('../lib/token')

//Token proxy - AWS implementation.
//See the token library for full documentation.
module.exports.tokenHandler = async (event, context) => {
	const dataHolderOrIdpMode = (event.requestContext.path == process.env.TOKEN_PATH ? 'dataholder' : 'idp')
	var handlerResponse = await tokenLib.tokenHandler(event.body, event.headers, dataHolderOrIdpMode)

	return {
		statusCode: handlerResponse.statusCode,
		body: JSON.stringify(handlerResponse.body),
		headers: {"Cache-Control": "no-store", "Pragma": "no-cache"}
	}
}
