const utils = require('../deploy_utils')
const ManagementClient = require('auth0').ManagementClient;
const models = require('./auth0_object_models')
const fs = require('fs')
const jose = require('node-jose');

module.exports.handlers = {
    handle_generate_deployment_credentials: async (rl, state) => {
        const deployKey = await getPublicPrivateJwks()
        const auth0DeploymentAPIPrivateKeyFile = 'auth0DeploymentApiPrivateKey-' + state.deploymentName + '.pem'

        fs.writeFileSync('../work/' + auth0DeploymentAPIPrivateKeyFile, jwk2pem(deployKey.privateKey), 'utf-8');
        console.log('Auth0 Deployment API Key Generated!')
        console.log(`Your Auth0 API private key, used for deployment purposes only, is located at: ${auth0DeploymentAPIPrivateKeyFile}`)
        console.log('--------------------------------------------------------------------------')
        console.log('Please login to your Auth0 admin console, and create an API service application with the following configuration:')
        console.log('Scopes: read:clients create:clients read:resource_servers create:resource_servers, create:custom_domains')
        console.log('--------------------------------------------------------------------------')
        console.log('Use the following public key for JWT authentication:')
        console.log(jwk2pem(deployKey.publicKey))
        console.log('--------------------------------------------------------------------------')
        console.log('When finished, keep note of the client_id of the application- you will need to enter it shortly.')
        
        state.auth0DeployMgmtPrivateKeyFile = '../work/' + auth0DeploymentAPIPrivateKeyFile

    },

    handle_deploy_auth0: async (rl, state) => {
        var auth0 = new ManagementClient({
            domain: state.auth0Domain,
            clientId: state.auth0DeployMgmtClientId,
            clientSecret: state.auth0DeployMgmtClientSecret,
            scope: 'read:clients create:clients read:resource_servers create:resource_servers'
        });
        const auth0APIPrivateKeyFile = 'auth0ApiPrivateKey-' + state.deploymentName + '.pem'

        //Deploy our resource server and applications
        const resourceServerId = await createApi(state, auth0)
        const appDetails = await createApps(state, auth0)

        //Output of detail to go into the platform deployment process.
        console.log('Auth0 objects created!')
        console.log('If you are following the manual, unguided process- please configure the following in your serverless.yml:')
        console.log('--------------------------------------------------------------------------')
        console.log(`Resource Server ID (FHIR_RESOURCE_SERVER_ID): ${resourceServerId}`)
        console.log('--------------------------------------------------------------------------')
        console.log('UDAP M2M App Details:')
        console.log(`UDAP M2M App Client ID (AUTH0_API_CLIENTID): ${appDetails.apiM2MClientId}`)
        console.log(`UDAP M2M App Client Private Key File (AUTH0_API_CLIENTSECRET): ${auth0APIPrivateKeyFile}`)
        console.log('--------------------------------------------------------------------------')

        if(appDetails.apiM2MClientPrivateKey) {
            //To be consistent, I'm storing the private key as PEM.
            fs.writeFileSync('../work/' + auth0APIPrivateKeyFile, jwk2pem(appDetails.apiM2MClientPrivateKey), 'utf-8');
        }
        state.auth0ApiClientPrivateKeyFile = auth0APIPrivateKeyFile
        state.auth0ApiClientId = appDetails.apiM2MClientId ? appDetails.apiM2MClientId : state.auth0ApiClientId
        state.fhirResourceServerId = resourceServerId ? resourceServerId : state.fhirResourceServerId
    },
    
    handle_auth0_create_custom_domain: async (rl, state) => {
        console.log('Creating custom domain in auth0...')
        var auth0 = new ManagementClient({
            domain: state.auth0Domain,
            clientId: state.auth0DeployMgmtClientId,
            clientSecret: state.auth0DeployMgmtClientSecret,
            scope: 'create:custom_domains'
        });
        const domainModel = models.customDomain
        domainModel.domain = state.baseDomain
        const addDomainOutput = await auth0.createCustomDomain(domainModel)
        console.log(`Domain created in Auth0 - domain id: ${addDomainOutput.custom_domain_id}`)

        console.log('In order to verify the domain in the next step, please configure the following DNS record.')
        console.log('--------------------------------------------------------------------------')
        console.log('Record Type: TXT')
        console.log('Record Domain Name: ' + addDomainOutput.verification.methods[0].domain)
        console.log('Record value: ' + addDomainOutput.verification.methods[0].record)
        console.log('--------------------------------------------------------------------------')

        state.auth0CustomDomainId = addDomainOutput.custom_domain_id
    },

    handle_auth0_verify_custom_domain: async (rl, state) => {
        console.log('Verifying custom domain in Auth0...')
        var auth0 = new ManagementClient({
            domain: state.auth0Domain,
            clientId: state.auth0DeployMgmtClientId,
            clientSecret: state.auth0DeployMgmtClientSecret,
            scope: 'create:custom_domains'
        });

        var verifyDomainOutput = await auth0.verifyCustomDomain({"id": state.auth0CustomDomainId})
        while(verifyDomainOutput.status != "ready") {
            console.log('Verification is not yet complete- please configure the following DNS record.')
            console.log('--------------------------------------------------------------------------')
            console.log('Record Type: TXT')
            console.log(`Record Domain Name: ${verifyDomainOutput.verification.methods[0].domain}`)
            console.log(`Record value: ${verifyDomainOutput.verification.methods[0].record}`)
            console.log('--------------------------------------------------------------------------')
            await utils.askSpecific(rl, 'Domain verification is not yet complete- ensure your DNS records are setup as specified. Press "y" to retry, or ctrl+c to exit and revisit later.', ['y'])

            verifyDomainOutput = await auth0.verifyCustomDomain({"id": state.auth0CustomDomainId})
        }
        console.log('Domain has been verified!')
        state.auth0CustomDomainApiKey = verifyDomainOutput.cname_api_key
        state.auth0CustomDomainBackendDomain = verifyDomainOutput.origin_domain_name

        console.log('If you are following the manual, unguided process- please configure the following in your serverless.yml:')
        console.log('--------------------------------------------------------------------------')
        console.log(`Auth0 Custom Domain Name Backend Hostname (AUTH0_CUSTOM_DOMAIN_NAME_BACKEND): ${verifyDomainOutput.origin_domain_name}`)
        console.log(`Auth0 Custom Domain Name API Key (AUTH0_CUSTOM_DOMAIN_NAME_APIKEY): ${verifyDomainOutput.cname_api_key}`)
        console.log('--------------------------------------------------------------------------')
    },
    handle_finished: async (rl, state) => {
        console.log('Your deployment is complete!')
        console.log('These are details you must provide to your FHIR implementation.')
        console.log('These values must be placed in the FHIR server\'s smart-configuration endpoint')

        //TODO: UDPATE THIS!
        console.log(`Issuer: https://${state.baseDomain}/`)
        console.log(`Authorize URL: https://${state.baseDomain}/authorize`)
        console.log(`Token URL: https://${state.baseDomain}/oauth/token`)
        console.log(`Keys URL: https://${state.baseDomain}/.well-known/jwks.json`)
    }
}

//Create Necessary Authz Server
async function createApi(state, auth0) {
    var authzServerModel = models.authzServer

    authzServerModel.name += '-' + state.deploymentName

    authzServerModel.identifier = state.fhirBaseUrl

    var grantedScopes = []
    if(state.smartVersions === 'v1') {
        grantedScopes = models.authzScopes.concat(models.smartv1Scopes)
    }
    else if(state.smartVersions === 'v2') {
        grantedScopes = models.authzScopes.concat(models.smartv2Scopes)
    }
    else {
        grantedScopes = models.authzScopes.concat(models.smartv1Scopes.concat(models.smartv2Scopes))
    }

    authzServerModel.scopes = grantedScopes

    console.log(`Creating authorization server: ${authzServerModel.name}`)
    console.log(`With scopes: ${authzServerModel.scopes}`)

    const resourceServers = await auth0.getResourceServers()
    const foundAuthzServer = resourceServers.filter(server => server.name == authzServerModel.name)

    console.log(resourceServers)
    console.log(foundAuthzServer)

    console.debug("Existing authorization server found:")
    console.debug(foundAuthzServer)

    if(foundAuthzServer.length == 0) {
        console.log('Creating authorization server: ' + authzServerModel.name)
        console.debug('Server object:')
        console.debug(authzServerModel)
    
        const createdAuthzServer = await auth0.createResourceServer(authzServerModel)
        console.log('Authorization Server Created.')
        return createdAuthzServer.id
    }
    else {
        console.log(`The authorization server: ${authzServerModel.name} already exists. Skipping create. Please manually delete it first and try again.`)
        return foundAuthzServer[0].id
    }
}

//Create Necessary Applications in auth0 for SMART FHIR Reference.
async function createApps(state, auth0) {
    //First, create the patient picker app.
    var apiM2MClientModel = models.apiM2MClient

    apiM2MClientModel.name += '-' + state.deploymentName

    var newAppCredential = auth0Models.newUdapAppCredential
    newAppCredential.name = apiM2MClientModel.name += '-' + state.deploymentName

    const jwks = await getPublicPrivateJwks()

    newAppCredential.pem = jwk2pem(jwks.publicKey)

    apiM2MClientModel.client_authentication_methods.private_key_jwt.credentials.push(newAppCredential)


    const apiM2MDetails = await createApp(auth0, apiM2MClientModel)

    //If we created the app, go ahead and grant it access to the auth0 management API.
    if(apiM2MDetails.created) {
        console.log('API Access Client Created. Granting auth0 management API scopes.')
        var apiM2MClientGrant = models.apiM2MClientGrant
        apiM2MClientGrant.client_id = apiM2MDetails.id
        apiM2MClientGrant.audience = `https://${state.auth0Domain}/api/v2/`
        await auth0.createClientGrant(apiM2MClientGrant)
    }

    const sampleAppDetails = await createApp(auth0, sampleConfidentialModel)
    if(sampleAppDetails.created) {
        console.log('Sample SMART/FHIR Client Created. Granting FHIR Scopes...')
        var sampleFHIRAppClientGrant = models.sampleFHIRAppClientGrant
        sampleFHIRAppClientGrant.client_id = sampleAppDetails.id
        sampleFHIRAppClientGrant.audience = state.fhirBaseUrl

        var grantedScopes = []
        if(state.smartVersions === 'v1') {
            grantedScopes = models.authzScopes.concat(models.smartv1Scopes)
        }
        else if(state.smartVersions === 'v2') {
            grantedScopes = models.authzScopes.concat(models.smartv2Scopes)
        }
        else {
            grantedScopes = models.authzScopes.concat(models.smartv1Scopes.concat(models.smartv2Scopes))
        }
        const scopeList = grantedScopes.map(scope => scope.value)
        sampleFHIRAppClientGrant.scope = scopeList

        await auth0.createClientGrant(sampleFHIRAppClientGrant)
    }

    return {
        "apiM2MClientId": apiM2MDetails.id,
        "apiM2MClientPrivateKey": apiM2MDetails.created ? jwk2pem(jwks.privateKey) : null
    }
}

//Creates a single application, given the application JSON model.
async function createApp(auth0, appModel) {
    console.log(`Creating app: ${appModel.name}`)

    //See if we have this object already.  If we do, let's skip.
    const apps = await auth0.getClients()
    const foundApp = apps.filter(app => app.name == appModel.name)

    console.debug('Existing apps found:')
    console.debug(foundApp)

    if(foundApp.length == 0) {
        console.log('Creating app: ' + appModel.name)
        console.debug('App object:')
        console.debug(appModel)
    
       const createdApp = await auth0.createClient(appModel)
    
        console.log('App Created.')
        console.debug(createdApp)
        return {
            created: true,
            id: createdApp.client_id,
            secret: createdApp.client_secret
        }
    }
    else {
        console.log(`The app: ${appModel.name} already exists. Skipping create. Please manually delete it first and try again.`)
        return {
            created: false,
            id: foundApp.client_id,
            secret: null
        }
    }
}

async function getPublicPrivateJwks() {
    console.log('Generating a new private key for the patient picker to use for auth0 API management calls')
    const keyStore = jose.JWK.createKeyStore()
    const newKeyStore = await keyStore.generate('RSA', 4096, {alg: 'RS256', use: 'sig' })
    const newKey = newKeyStore.toJSON(true)

    return {
        publicKey: {
            kty: newKey.kty,
            e: newKey.e,
            kid: newKey.kid,
            n: newKey.n
        },
        privateKey: {
            "d": newKey.d,
            "p": newKey.p,
            "q": newKey.q,
            "dp": newKey.dp,
            "dq": newKey.dq,
            "qi": newKey.qi,
            "kty": newKey.kty,
            "e": newKey.e,
            "kid": newKey.kid,
            "n": newKey.n
        }
    }
}