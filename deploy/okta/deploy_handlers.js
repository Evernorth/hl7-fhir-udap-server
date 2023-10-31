const models = require('./okta_object_models');
const okta = require('@okta/okta-sdk-nodejs');
const jose = require('node-jose');
const jwk2pem = require('pem-jwk').jwk2pem
const fs = require('fs');
const utils = require('../deploy_utils')

module.exports.handlers = {
    handle_generate_deployment_credentials: async (rl, state) => {
        const deployKey = await getPublicPrivateJwks()
        const oktaDeploymentAPIPrivateKeyFile = 'oktaDeploymentApiPrivateKey-' + state.deploymentName + '.pem'

        fs.writeFileSync('./work/' + oktaDeploymentAPIPrivateKeyFile, jwk2pem(deployKey.privateKey), 'utf-8');
        console.log('Okta Deployment API Key Generated!')
        console.log(`Your Okta API private key, used for deployment purposes only, is located at: ${oktaDeploymentAPIPrivateKeyFile}`)
        console.log('--------------------------------------------------------------------------')
        console.log('Please login to your Okta admin console, and create an API service application with the following configuration:')
        console.log('Scopes: okta.apps.manage, okta.apps.read, okta.appGrants.manage, okta.appGrants.read, okta.authorizationServers.read, okta.authorizationServers.manage, okta.domains.manage, okta.domains.read, okta.clients.read, okta.clients.manage, okta.roles.manage, okta.roles.read')
        console.log('Please assign the super admin role to the deployment app- temporarily for deployment.')
        console.log('--------------------------------------------------------------------------')
        console.log('Use the following public key for JWT authentication:')
        console.log(JSON.stringify(deployKey.publicKey))
        console.log('--------------------------------------------------------------------------')
        console.log('When finished, keep note of the client_id of the application- you will need to enter it shortly.')

        state.oktaDeployMgmtPrivateKeyFile = './work/' + oktaDeploymentAPIPrivateKeyFile

    },
    handle_deploy_okta: async (rl, state) => {
        const client = getClient(state)
        const oktaAPIPrivateKeyFile = 'oktaApiPrivateKey-' + state.deploymentName + '.pem'

        //Deploy our resource server and applications
        const appDetails = await createApps(state, client)
        const resourceServerId = await createAuthzServer(state, client)

        //Output of detail to go into the platform deployment process.
        console.log('Okta objects created!')
        console.log('--------------------------------------------------------------------------')
        console.log(`Resource Server ID (FHIR_RESOURCE_SERVER_ID in serverless.yml): ${resourceServerId}`)
        console.log('--------------------------------------------------------------------------')
        console.log('UDAP M2M App Details:')
        console.log(`UDAP M2M App Client ID (OKTA_CLIENT_ID in serverless.yml): ${appDetails.apiM2MClientId}`)
        console.log(`UDAP M2M App Client Private Key File (OKTA_PRIVATE_KEY_FILE in serverless.yml): ${oktaAPIPrivateKeyFile}`)
        console.log('--------------------------------------------------------------------------')

        state.oktaApiClientId = appDetails.apiM2MClientId ? appDetails.apiM2MClientId : state.auth0ApiClientId
        state.oktaResourceServerId = resourceServerId ? resourceServerId : state.oktaResourceServerId

        if(appDetails.apiM2MClientPrivateKey) {
            //To be consistent, I'm storing the private key as PEM.
            fs.writeFileSync('./work/' + oktaAPIPrivateKeyFile, jwk2pem(appDetails.apiM2MClientPrivateKey), 'utf-8');
        }
        state.oktaApiClientPrivateKeyFile = oktaAPIPrivateKeyFile
    },
    
    handle_okta_create_custom_domain: async (rl, state) => {
        console.log('Creating custom domain in Okta...')

        const client = getClient(state)
        const domainConfig = {
            "certificateSourceType": "OKTA_MANAGED",
            "domain": state.baseDomain
        }
        const domain = await client.customDomainApi.createCustomDomain({domain: domainConfig})
        if(domain.id) {
            console.log('Initial domain creation successful. To finish this operation, set up the following DNS records in your DNS provider:')
            console.log('----------------------------------------------------')
            for(const record of domain.dnsRecords) {
                console.log(`RecordType: ${record.recordType} | Fully Qualified Name: ${record.fqdn} | Value: ${record.values[0]}`)
                if(record.recordType == 'CNAME') {
                    state.oktaCustomDomainBackendDomain = record.values[0]
                }
            }
            console.log('----------------------------------------------------')

            state.oktaCustomDomainId = domain.id
        }
        else {
            console.log('Domain setup failed.')
        }
    },

    handle_okta_verify_custom_domain: async (rl, state) => {
        console.log('Verifying custom domain in Okta...')
        const client = getClient(state)

        var domain = await client.customDomainApi.verifyDomain({domainId: state.oktaCustomDomainId})

        while(domain.validationStatus != 'COMPLETED' && domain.validationStatus != 'VERIFIED') {
            console.log('Domain setup not yet complete.  Awaiting DNS record verification.')
            console.log('----------------------------------------------------')
            for(const record of domain.dnsRecords) {
                console.log(`RecordType: ${record.recordType} | Fully Qualified Name: ${record.fqdn} | Value: ${record.values[0]}`)
            }
            console.log('----------------------------------------------------')
            await utils.askSpecific(rl, 'Domain verification is not yet complete- ensure your DNS records are setup as specified. Press "y" to retry, or ctrl+c to exit and revisit later.', ['y'])

            domain = await client.customDomainApi.verifyDomain({domainId: state.oktaCustomDomainId})
        }
        console.log('Domain setup complete! Your Okta org should now be available at: https://' + state.baseDomain)
    },

    handle_finished: async (rl, state) => {
        console.log('Your deployment is complete!')
        console.log('These are details you must provide to your FHIR implementation.')
        console.log('These values must be placed in the FHIR server\'s smart-configuration endpoint')

        console.log(`Issuer: https://${state.baseDomain}/oauth2/${state.oktaResourceServerId}`)
        console.log(`Authorize URL: https://${state.baseDomain}/oauth2/${state.oktaResourceServerId}/v1/authorize`)
        console.log(`Token URL: https://${state.baseDomain}/oauth2/${state.oktaResourceServerId}/v1/token`)
        console.log(`Keys URL: https://${state.baseDomain}/oauth2/${state.oktaResourceServerId}/v1/keys`)
    }
}

//Create Necessary Authz Server
async function createAuthzServer(state, client) {
    var authzServerModel = models.authzServer

    authzServerModel.name += '-' + state.deploymentName

    authzServerModel.audiences.push(state.fhirBaseUrl)

    console.log(`Creating authorization server: ${authzServerModel.name}`)

    var foundAuthzServer = null
    const authzServers = await client.authorizationServerApi.listAuthorizationServers({'q': authzServerModel.name})
    await authzServers.each(server => {
        if(server.name == authzServerModel.name) {
            foundAuthzServer = server
            return
        }
    })

    console.debug("Existing authorization server found:")
    console.debug(foundAuthzServer)

    if(!foundAuthzServer) {
        console.log('Creating authorization server: ' + authzServerModel.name)
        console.debug('Server object:')
        console.debug(authzServerModel)
    
        const createdAuthzServer = await client.authorizationServerApi.createAuthorizationServer({authorizationServer: authzServerModel})
        console.log('Authorization Server Created.')
        await addAuthzScopes(state, client, createdAuthzServer.id)
        await addAuthzClaims(state, client, createdAuthzServer.id)
        console.log('Finished initial authorization server configuration.')
        return createdAuthzServer.id
    }
    else {
        console.log(`The authorization server: ${authzServerModel.name} already exists. Skipping create. Please manually delete it first and try again.`)
        return foundAuthzServer.id
    }
}

async function addAuthzScopes(state, client, authzServerId) {
    //We're not dealing with "existing" items here.  That's handled at the authz server level.  If we're here, it means we definitely need to add scopes.
    console.log('Adding global SMART scopes to the authorization server...')
    const scopes = models.authzScopes
    for(const scope of scopes) {
        console.log('Adding scope: ' + scope.name)
        console.log(scope)
        await client.authorizationServerApi.createOAuth2Scope({authServerId: authzServerId, oAuth2Scope: scope})
    }
    
    if(state.smartVersionScopes == 'v1' || state.smartVersionScopes == 'both') {
        console.log('Adding SMART v1 specific scopes to the authorization server...')
        const scopes = models.smartv1Scopes
        for(const scope of scopes) {
            console.log('Adding scope: ' + scope.name)
            console.log(scope)
            await client.authorizationServerApi.createOAuth2Scope({authServerId: authzServerId, oAuth2Scope: scope})
        }
    }
    if(state.smartVersionScopes == 'v2' || state.smartVersionScopes == 'both') {
        console.log('Adding SMART v2 specific scopes to the authorization server...')
        const scopes = models.smartv2Scopes
        for(const scope of scopes) {
            console.log('Adding scope: ' + scope.name)
            console.log(scope)
            await client.authorizationServerApi.createOAuth2Scope({authServerId: authzServerId, oAuth2Scope: scope})
        }
    }
    console.log('Finished adding scopes.')
}

async function addAuthzClaims(state, client, authzServerId) {
    //We're not dealing with "existing" items here.  That's handled at the authz server level.  If we're here, it means we definitely need to add scopes.
    console.log('Adding SMART claims to the authorization server...')
    const claims = models.authzClaims
    for(const claim of claims) {
        console.log('Adding claim: ' + claim.name)
        await client.authorizationServerApi.createOAuth2Claim({authServerId: authzServerId, oAuth2Claim: claim})
    }
    console.log('Finished adding claims.')
}

//Create Necessary Applications
async function createApps(state, client) {
    //Create our API M2M Client app for our TDCR endpoint to use.
    var apiM2MClientModel = models.oktaAPIM2MClient
    var apiScopes = models.oktaAPIM2MClientScopes

    apiM2MClientModel.label += '-' + state.deploymentName

    const keyPair = await getPublicPrivateJwks()
    apiM2MClientModel.settings.oauthClient.jwks.keys.push(keyPair.publicKey)
    const apiM2MDetails = await createApp(client, apiM2MClientModel)

    if(apiM2MDetails.created) {
        console.log('API Access Client Created. Granting Okta management API scopes.')
        for(const scope of apiScopes) {
            console.log(`Adding scope: ${scope} to Okta Org: https://${state.oktaDomain}`)
            await client.applicationApi.grantConsentToScope({appId: apiM2MDetails.id, oAuth2ScopeConsentGrant: {"issuer": `https://${state.oktaDomain}`, "scopeId": scope}})
        }

        console.log('Scopes granted. Assigning application admin role to the new application.')
        const url = `${client.baseUrl}/oauth2/v1/clients/${apiM2MDetails.id}/roles`
        const appAdminRequest = {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({type: "APP_ADMIN"})
        }
        await client.http.http(url, appAdminRequest)

        console.log('Role assigned. Assigning the organization admin role to the new application.')
        const orgAdminRequest = {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({type: "ORG_ADMIN"})
        }
        await client.http.http(url, orgAdminRequest) 

        console.log('Role assigned. Assigning the API Access Management admin role to the new application.')
        const apiAMAdminRequest = {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({type: "API_ACCESS_MANAGEMENT_ADMIN"})
        }
        await client.http.http(url, apiAMAdminRequest) 

    }

    return {
        "apiM2MClientId": apiM2MDetails.id,
        "apiM2MClientPrivateKey": apiM2MDetails.created ? keyPair.privateKey : null
    }
}

//Creates a single application, given the application JSON model.
async function createApp(client, appModel) {
    console.log(`Creating app: ${appModel.label}`)

    var foundApp = null
    const query = {'filter': 'name eq "oidc_client"'}
    //See if we have this object already.  If we do, let's skip.
    const apps = await client.applicationApi.listApplications(query)

    await apps.each(app => {
        if(app.label == appModel.label) {
            foundApp = app
            return
        }
    })

    console.debug('Existing apps found:')
    console.debug(foundApp)

    if(!foundApp) {
        console.log('Creating app: ' + appModel.label)
        console.debug('App object:')
        console.debug(appModel)
    
       const createdApp = await client.applicationApi.createApplication({ application: appModel })
    
        console.log('App Created.')
        console.debug(createdApp)
        return {
            created: true,
            id: createdApp.id
        }
    }
    else {
        console.log(`The app: ${appModel.label} already exists. Skipping create. Please manually delete it first and try again.`)
        return {
            created: false,
            id: foundApp.id
        }
    }
}

function getClient(state) {
    const keyPem = fs.readFileSync(state.oktaDeployMgmtPrivateKeyFile, 'utf-8')
    return new okta.Client({
        orgUrl: `https://${state.oktaDomain}`,
        authorizationMode: 'PrivateKey',
        clientId: state.oktaDeployMgmtClientId,
        scopes: ['okta.apps.manage', 'okta.apps.read', 'okta.appGrants.manage', 'okta.appGrants.read', 'okta.authorizationServers.read', 'okta.authorizationServers.manage', 'okta.domains.manage', 'okta.domains.read', 'okta.clients.read', 'okta.clients.manage', 'okta.roles.read', 'okta.roles.manage'],
        privateKey: keyPem
      });
}

async function getPublicPrivateJwks() {
    console.log('Generating a new private key for accessing the Okta API...')
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