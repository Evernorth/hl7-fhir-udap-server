const utils = require('./deploy_utils')

module.exports.specificStateVariables = {
    cloudPlatform: '',
    oauthPlatform: '',
    currentStep: '',
    deploymentName: '',
    smartVersionScopes: '',
    baseDomain: '',
    fhirBaseUrl: '',
    fhirResourceServerId: '',
    oauthDeployMgmtClientId: '',
    oauthRuntimeAPIClientId: '',
    oauthRuntimeAPIPrivateKeyFile: '',
    oauthServiceBaseDomain: '',
    oauthCustomDomainId: '',
    oauthCustomDomainBackendDomain: '',
    oauthCustomDomainApiKey: '',
    udapCommunityCertFile: '',
    udapMemberP12File: '',
    udapMemberP12Pwd: '',
    udapOrganizationName: '',
    udapOrganizationId: '',
    udapPurposeOfUse: '',
    logoUri: ''
}

module.exports.handlers = {
    handle_deploy_questionnaire: async (rl, state) => {
        console.log('Collecting general configuration information...')
        state.deploymentName = state.deploymentName ? state.deploymentName : await utils.askPattern(rl, 'What would you like to name your deployment? This name is appended to all objects in your chosen OAuth platform, and is also appended to all objects in AWS for easy association (Example: SMARTv1)', /.+/)
        state.smartVersionScopes = await utils.askSpecific(rl, 'What SMART versions would you like to support? (v1, v2, both)', ['v1','v2','both'])
        state.baseDomain = await utils.askPattern(rl, 'What will the base domain of your authorization service be? (Example: smartauthz.your.tld)', /.+/)
        state.fhirBaseUrl = await utils.askPattern(rl, 'What is the base URL of the FHIR server you are securing? (Example: https://fhir.your.tld/r4)', /.+/)
        state.udapCommunityCertFile = await utils.askPattern(rl, 'Please enter the file path (relative to the base of this entire project) of your UDAP community trust anchor here. This will be a CA certificate in PEM format. (Example: udap_pki/ca.pem)', /.+/)
        state.udapMemberP12File = await utils.askPattern(rl, 'Please enter the file path of your server\'s community private key/certificate file (relative to the base of this entire project). This file will identify your server as being part of a community, and must be in PKCS12 format (Example: udap_pki/myserver.p12)', /.+/)
        state.udapMemberP12Pwd = await utils.askPattern(rl, 'Please enter the encryption password of your PKCS12 file here', /.+/)
        state.udapOrganizationName = await utils.askPattern(rl, 'Please enter your organization name. This will be used when registering as a data holder with an upstream IDP', /.+/)
        state.udapOrganizationId = await utils.askPattern(rl, 'Please enter your organization ID in your community. This will be used when registering as a data holder with an upstream IDP', /.+/)
        state.udapPurposeOfUse = await utils.askPattern(rl, 'Please enter your purpose of use for your community membership. This will be used when registering as a data holder with an upstream IDP (Example: urn:oid:2.16.840.1.113883.5.8#TREAT)', /.+/)
        state.logoUri = await utils.askPattern(rl, 'Please enter the url of a publiclly accessable logo to represent your server as it registers with an upstream IDP as a client in tiered-oauth. It must refer to a PNG/JPG/GIF image.', /.+/)

        console.log('All set! Current configuration:')
        console.log(state)
    }
}