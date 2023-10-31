'use strict'

const udapCommon = require('udap-common')
const wellKnown = require('./udap_well_known')
const axios = require('axios')

//This is an implementation of UDAP's Trusted Dynamic Client Registration.   It is a proxy to OKTA's Dynamic Client Registartion.
//Dynamic Client Registration Proxy

//This method is taked with general validation that's required no matter what type of request (edit/create/delete).
//This includes basic request formatting checks as well as general JWT validations.
//This EXCLUDES full softwarestatement metadata checks since those can be a little different for edit/create/delete.
module.exports.validateUdapCommonRegistrationRequest = async (clientRegisterRequestBody) => {
  console.log('Validating signed software statement')
  console.log("Client request body:")
  console.log(clientRegisterRequestBody)

  const inboundSoftwareStatement = JSON.parse(clientRegisterRequestBody).software_statement

  console.log('Software Statement:')
  console.log(inboundSoftwareStatement)
  var validationResult = null

  //Validate the proper UDAP signed software statement token.
  try {
    const trustAnchorObject = udapCommon.parseTrustAnchorPEM(process.env.COMMUNITY_CERT)
    const softwareStatementDetail = await validateUdapCommonSoftwareStatement(inboundSoftwareStatement, trustAnchorObject)
    const jwks = udapCommon.getPublicKeyJWKS(inboundSoftwareStatement)

    console.log("Cert:")
    console.log(softwareStatementDetail.cert)
    console.log("Verified Jwt:")
    console.log(softwareStatementDetail.verifiedJwt)
    console.log("SAN:")
    console.log(softwareStatementDetail.subjectAlternativeName)
    console.log("App JWKS")
    console.log(jwks)

    return {
      inboundSoftwareStatement: inboundSoftwareStatement,
      subjectAlternativeName: softwareStatementDetail.subjectAlternativeName,
      verifiedJwt: softwareStatementDetail.verifiedJwt,
      verifiedJwtJwks: jwks
    }
  }
  catch (ex) {
      //At this point we can get a few different types of errors- so let's just parrot out the internal exception.
      console.error("validateUdapSoftwareStatement Exception:")
      console.error(ex)
      const returnBody = {
          'error' : ex.code,
          'error_description': ex.message
      }
      validationResult.statusCode = 400
      validationResult.body = returnBody
      return validationResult
  }
}

async function validateUdapCommonSoftwareStatement(inboundSoftwareStatement, trustAnchorObject) {
  //Validate Client software statement
  // 1 validate signature using public key from x5c parameter in JOSE header
  // 2 Validate/Construct certificate chain
  // 3 Validate the software statement
  //  iss, sub, aud, exp, iat, jti values in software statement
  // 		iss must match uriName in the Subject Alternative Names extension of client certificate.
  //      sub value must match iss value
  //		aud value must contain the Auhtorization Server's registration endpoint URL
  //      Software statement must be unexpired

  /*
  Errors Defined here:
      https://datatracker.ietf.org/doc/html/rfc7591#section-3.2.2

  RFC 7591 Error codes
    invalid_redirect_uri
    The value of one or more redirection URIs is invalid.

  invalid_client_metadata
    The value of one of the client metadata fields is invalid and the
    server has rejected this request.  Note that an authorization
    server MAY choose to substitute a valid value for any requested
    parameter of a client's metadata.

  invalid_software_statement
    The software statement presented is invalid.

  unapproved_software_statement
    The software statement presented is not approved for use by this
    authorization server.
  */

  //Perform basic JWT PKI and signature checks.
  const jwtDetails = await udapCommon.verifyUdapJwtCommon(inboundSoftwareStatement, trustAnchorObject)

  //UDAP Specific properties validation
  console.log('JWT Body to validate:')
  console.log(jwtDetails.verifiedJwt.body)

  const firstSAN = validateUdapCommonSignedSoftwareBody(jwtDetails)


  console.log("First SAN: " + firstSAN)
  return {
    cert: jwtDetails.verifiedJwtCertificate,
    verifiedJwt: jwtDetails.verifiedJwt,
    subjectAlternativeName: firstSAN
  }
}

//These are basic JWT checks to ensure that the JWT is intended for our endpoint, it's not expired, and is signed with a valid certificate.
function validateUdapCommonSignedSoftwareBody(jwtDetails) {
  var error = new Error()
  error.code = 'invalid_software_statement'
  const ssJwtBody = jwtDetails.verifiedJwt.body
  const ssJwtCert = jwtDetails.verifiedJwtCertificate

  if (!ssJwtBody.hasOwnProperty('sub') || !ssJwtBody.hasOwnProperty('iss') ||
        ssJwtBody.iss != ssJwtBody.sub || ssJwtBody.iss == "" || ssJwtBody.sub == "") { 
        error.message = 'Invalid iss/sub values'
        console.error(error)
        throw error
  }

  //Validate that the iss claim matches a SAN from within the certificate defined in x5c header. 
  if (!udapCommon.validateSanInCert(ssJwtBody.iss, ssJwtCert)) {
      error.message = 'Invalid iss value'
      console.error(error)  
      throw error
  }
 
  //We need to ensure the aud is set properly.
  if (ssJwtBody.aud == "" || ssJwtBody.aud != process.env.REGISTRATION_ENDPOINT)
  {
      error.message = 'Invalid aud value||'
      console.error(error)
      throw error
  }

  //Validate certificate dates (issued at and expiry)
  var d = new Date()
  console.log("IAT: " + (ssJwtBody.iat * 1000) + " Exp: " + (ssJwtBody.exp * 1000) + " Current Date: " + d.getTime())
  if (!ssJwtBody.hasOwnProperty('iat') || ssJwtBody.iat == "" || (ssJwtBody.iat * 1000) >= d.getTime())
  {
      error.message = 'Invalid iat value'
      throw error
  }
  if (!ssJwtBody.hasOwnProperty('exp') || ssJwtBody.exp == "" ||
  (ssJwtBody.exp*1000 <= d.getTime()) || (ssJwtBody.exp - ssJwtBody.iat)>300)
  {
      error.message = 'Invalid exp value'
      console.error(error)
      throw error
  }

  //TODO: I don't love that we're returning this value here like this- perhaps we rename the function to make it clearer.
  return ssJwtBody.iss
}

//Now that we have a valid JWT that's intended for our endpoint, signed with valid cert, etc. Now let's ensure all the metadata of the request is valid.
module.exports.validateClientRegistrationMetaData = async (jwtDetails, editMode) => {
  console.log('Checking client metadata')
  var error = new Error()
  error.code = 'invalid_client_metadata'
  const ssJwtBody = jwtDetails.body
  const metadata = await wellKnown.getFHIRServerWellKnown()

  //REQUIRED ATTRIBUTES CHECKS FIRST
  if (!ssJwtBody.hasOwnProperty('client_name') || ssJwtBody.client_name == '')
  {
    error.message = 'Missing client_name'
    console.error(error)
    throw error
  }
  
  //grant_types array is required, but only for creates, not edits. For edits, an empty grant types array means delete.
  if (!editMode && (!ssJwtBody.hasOwnProperty('grant_types') || ssJwtBody.grant_types == ''))
  {
    error.message = 'Missing grant_types'
    console.error(error)
    throw error
  }

  if(!ssJwtBody.hasOwnProperty('scope')) {
    error.message = 'Missing scope'
    console.error(error)
    throw error 
  }

  if ((!ssJwtBody.hasOwnProperty('response_types') || ssJwtBody.response_types == '') && (ssJwtBody.grant_types.includes('authorization_code')))
  {
    error.message = 'Missing response_types'
    console.error(error)
    throw error
  }

  if (!ssJwtBody.hasOwnProperty('token_endpoint_auth_method') || ssJwtBody.token_endpoint_auth_method == '')
  {
    error.message = 'Missing token_endpoint_auth_method'
    console.error(error)
    throw error
  }

  if ((!ssJwtBody.hasOwnProperty('redirect_uris') || ssJwtBody.redirect_uris == '') && (ssJwtBody.grant_types.includes('authorization_code')))
  {
    error.message = 'Missing redirect_uris'
    console.error(error)
    throw error
  }

  if ((!ssJwtBody.hasOwnProperty('logo_uri') || ssJwtBody.logo_uri == '') && (ssJwtBody.grant_types.includes('authorization_code')))
  {
    error.message = 'Missing logo_uri'
    console.error(error)
    throw error
  }

  if(ssJwtBody.logo_uri && !(await validateLogoUri(ssJwtBody.logo_uri))) {
    error.message = 'The provided logo_uri must refer to a valid png, jpg, or gif image.'
    console.error(error)
    throw error
  }


  //CHECKS AGAINST METADATA NEXT
  console.log("Metadata:")
  console.log(metadata)

  const requestedScopes = ssJwtBody.scope.split(' ')

  const unsupportedScopes = requestedScopes.filter((requestedScope) => !metadata.scopes_supported.includes(requestedScope));

  if(unsupportedScopes.length > 0) {
    error.message = `Your application is requesting unsupported scopes: ${JSON.stringify(unsupportedScopes)}`
    console.error(error)
    throw error
  }

  if(!metadata.udap_profiles_supported.includes('udap_dcr')) {
    error.message = 'This server does not support dynamic client registration.'
    console.error(error)
    throw error
  }

  if(!metadata.grant_types_supported.includes('authorization_code') && ssJwtBody.grant_types.includes('authorization_code')) {
    error.message = 'This server does not support the authorization code flow.'
    console.error(error)
    throw error
  }

  if(!metadata.grant_types_supported.includes('client_credentials') && ssJwtBody.grant_types.includes('client_credentials')) {
    error.message = 'This server does not support the client credentials flow.'
    console.error(error)
    throw error
  }

  //OTHER ILLEGAL CIRCUMSTANCES ACCORDING TO UDAP IG
  if(ssJwtBody.grant_types.includes('authorization_code') && ssJwtBody.grant_types.includes('client_credentials')) {
    error.message = 'A client cannot have both authorization_code and client_credentials grant types.'
    console.error(error)
    throw error
  }
}

async function validateLogoUri(uri) {
  var valid = false
  try {
    const logoResponse = await axios.request({
      'url': uri,
      'method': 'GET',
    })
    valid = logoResponse.headers.hasOwnProperty('content-type') && ['image/png', 'image/gif', 'image/jpeg', 'image/jpg'].includes(logoResponse.headers['content-type'])
  }
  catch(err) {
    console.log(err)
  }
  return valid
}

