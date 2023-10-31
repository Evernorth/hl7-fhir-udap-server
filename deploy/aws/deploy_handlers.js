const utils = require('../deploy_utils')
const YAML = require('yaml')
const fs = require('fs')
const execSync = require('child_process').execSync;

const SERVERLESS_AWS_EXAMPLE_CONFIG = './aws/serverless-example-{platform}.yml'

module.exports.handlers = {
    handle_deploy_questionnaire: async (rl, state) => {
        console.log('Collecting initial configuration information...')
        state.smartVersionScopes = await utils.askSpecific(rl, 'What SMART versions would you like to support? (v1, v2, both)', ['v1','v2','both'])
        state.awsRegion = await utils.askPattern(rl, 'What AWS region are you deploying in? (Example: us-east-1)', /.+/)
        state.baseDomain = await utils.askPattern(rl, 'What will the base domain of your authorization service be? (Example: smartauthz.your.tld)', /.+/)
        state.fhirBaseUrl = await utils.askPattern(rl, 'What is the base URL of the FHIR server you are securing? (Example: https://fhir.your.tld/r4)', /.+/)
      
        state.oktaDomain = await utils.askPattern(rl, 'What Okta tenant will you use to secure this FHIR server? (Example: yourtenant.region.auth0.com)', /.+/)
        state.oktaDeployMgmtClientId = await utils.askPattern(rl, 'Please enter the client id of the machine to machine application in your tenant for use by the deploy script to create required objects. You created this at the beginning of this process.', /.+/)
        
        state.udapCommunityCertFile = await utils.askPattern(rl, 'Please enter the file path of your UDAP community trust anchor here. This will be a CA certificate in PEM format', /.+/)
        state.udapMemberP12File = await utils.askPattern(rl, 'Please enter the file path of your server\'s community private key/certificate file. This file will identify your server as being part of a community, and must be in PKCS12 format', /.+/)
        state.udapMemberP12Pwd = await utils.askPattern(rl, 'Please enter the encryption password of your PKCS12 file here', /.+/)
        state.udapOrganizationName = await utils.askPattern(rl, 'Please enter your organization name. This will be used when registering as a data holder with an upstream IDP', /.+/)
        state.udapOrganizationId = await utils.askPattern(rl, 'Please enter your organization ID in your community. This will be used when registering as a data holder with an upstream IDP', /.+/)
        state.udapPurposeOfUse = await utils.askPattern(rl, 'Please enter your purpose of use for your community membership. This will be used when registering as a data holder with an upstream IDP', /.+/)

        console.log('All set! Deploying with the following configuration:')
        console.log(state)
    },

    handle_generate_serverless_config: async (rl, state) => {
        const serverlessConfigFile= `./work/serverless.${state.deploymentName}.yml`
        const exampleServerlessConfigFile = SERVERLESS_AWS_EXAMPLE_CONFIG.replace('{platform}',state.oktaPlatform)

        console.log(`Reading example serverless config at: ${exampleServerlessConfigFile}`)
        var serverlessConfig = YAML.parse(fs.readFileSync(exampleServerlessConfigFile, 'utf-8'));
        
        serverlessConfig.service = `${serverlessConfig.service}-${state.deploymentName}`
        serverlessConfig.params.default.AWS_REGION = state.awsRegion
        serverlessConfig.params.default.BASE_DOMAIN = state.baseDomain
        const domainParts = state.baseDomain.split('.')
        serverlessConfig.params.default.BASE_TLD = `${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}.`
        serverlessConfig.params.default.FHIR_BASE_URL = state.fhirBaseUrl
    
        serverlessConfig.params.default.OKTA_ORG = state.oktaDomain
        serverlessConfig.params.default.OKTA_CUSTOM_DOMAIN_NAME_BACKEND = state.oktaCustomDomainBackendDomain
        serverlessConfig.params.default.OKTA_CUSTOM_DOMAIN_NAME_APIKEY = state.auth0CustomDomainApiKey
        serverlessConfig.params.default.API_GATEWAY_DOMAIN_NAME_BACKEND = state.apiGatewayBackendDomain

        serverlessConfig.params.default.OKTA_CLIENT_ID = state.oktaApiClientId
        serverlessConfig.params.default.OKTA_PRIVATE_KEY_FILE = `udap_pki/${state.oktaApiClientPrivateKeyFile}`

        serverlessConfig.params.default.COMMUNITY_CERT = state.udapCommunityCertFile
        serverlessConfig.params.default.SERVER_KEY = state.udapMemberP12File
        serverlessConfig.params.default.SERVER_KEY_PWD = state.udapMemberP12Pwd
        serverlessConfig.params.default.ORGANIZATION_NAME = state.udapOrganizationName
        serverlessConfig.params.default.ORGANIZATION_ID = state.udapOrganizationId

        serverlessConfig.params.default.PURPOSE_OF_USE = state.udapPurposeOfUse

        serverlessConfig.params.default.OKTA_RESOURCE_SERVER_ID = state.oktaResourceServerId

        console.log(`Writing new config file at: ${serverlessConfigFile}`)
        fs.writeFileSync(serverlessConfigFile, YAML.stringify(serverlessConfig), 'utf-8');
    },

    handle_aws_certs: async (rl, state) => {
        const usingRoute53 = await utils.askSpecific(rl, 'Are you using route53 to handle DNS for your base domain?', ['y','n'])
        if(usingRoute53 == 'y') {
            console.log('Requesting and deploying TLS certs in AWS...')
            console.log('Ensuring pre-requisite software is installed...')
            execSync('npm install', {cwd: '../', stdio: 'inherit'})

            console.log(`Requesting a cert in ${state.awsRegion}`)
            const certDeployServerlessConfigFile = `./work/serverless.${state.deploymentName}.cert.yml`
            const domainParts = state.baseDomain.split('.')

            const certServerlessConfig = {
                service: `cert-deploy-${state.awsRegion}`,
                plugins: ['serverless-certificate-creator'],
                provider: {name: 'aws', region: state.awsRegion},
                custom: {
                    customCertificate: {
                        certificateName: state.baseDomain,
                        region: state.awsRegion,
                        hostedZoneNames: `${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}.`,
                        subjectAlternativeNames: [state.baseDomain]
                    }
                }
            } 
            fs.writeFileSync(certDeployServerlessConfigFile, YAML.stringify(certServerlessConfig), 'utf-8');
            
            execSync(`serverless create-cert --verbose -c ${certDeployServerlessConfigFile.replace('./work/','')}`, {cwd: './work', stdio: 'inherit'})

            if(state.awsRegion != 'us-east-1') {
                console.log('Your service is being deployed outside of us-east-1. Cloudfront requires a certificate in us-east-1. Requesting the same cert in us-east-1')
                const usEastCertDeployServerlessConfigFile = `./work/serverless.${state.deploymentName}.useast1.cert.yml`
                const certUSEastServerlessConfig = {
                    service: `cert-deploy-us-east-1`,
                    plugins: ['serverless-certificate-creator'],
                    provider: {name: 'aws', region: 'us-east-1'},
                    custom: {
                        customCertificate: {
                            certificateName: state.baseDomain,
                            region: 'us-east-1',
                            hostedZoneNames: `${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}.`,
                            subjectAlternativeNames: [state.baseDomain]
                        }
                    }
                } 
                fs.writeFileSync(usEastCertDeployServerlessConfigFile, YAML.stringify(certUSEastServerlessConfig), 'utf-8');
                execSync(`serverless create-cert --verbose -c ${usEastCertDeployServerlessConfigFile.replace('./work/','')}`, {cwd: './work', stdio: 'inherit'})
            }
        }
        else {
            console.log('If you are not using route 53, you will have to manually request your certificate within the ACM module of AWS.')
            console.log('Please see: https://docs.aws.amazon.com/acm/latest/userguide/gs-acm-request-public.html')
            console.log('You must request a certificate for: ' + state.BASE_DOMAIN + ' in AWS region: ' + state.awsRegion)
            if(state.awsRegion != 'us-east-1') {
                console.log('You must also request a certificate for: ' + state.BASE_DOMAIN + ' in AWS region us-east-1! This is required for our cloudfront setup.')
            }
            console.log('When completed with your certificate requests and completed domain validation- proceed to the next step.')
        }
    },

    handle_aws_custom_domain: async (rl, state) => {
        console.log('Setting up custom domain in AWS API Gateway...')

        const domainDeployServerlessConfigFile = `./work/serverless.${state.deploymentName}.domain.yml`

        const domainServerlessConfig = {
            service: `domain-deploy-${state.awsRegion}`,
            plugins: ['serverless-domain-manager'],
            provider: {name: 'aws', region: state.awsRegion},
            custom: {
                customDomain: {
                    domainName: state.baseDomain,
                    certificateName: state.baseDomain,
                    basePath: '',
                    createRoute53Record: false,
                    endpointType: 'regional'
                }
            }
        } 

        fs.writeFileSync(domainDeployServerlessConfigFile, YAML.stringify(domainServerlessConfig), 'utf-8');
            
        execSync(`serverless create_domain --verbose -c ${domainDeployServerlessConfigFile.replace('./work/','')}`, {cwd: './work', stdio: 'inherit'})
    },

    handle_collect_aws_api_gateway_domain: async (rl, state) => {
        console.log('Manual step to configure the custom domain in AWS API Gateway...')
        console.log('In order to finalize our AWS setup, we need the API gateway internal domain name for the custom domain we just created.')
        console.log('To get this value, visit the following URL:')
        console.log(`https://${state.awsRegion}.console.aws.amazon.com/apigateway/main/publish/domain-names?domain=${state.baseDomain}&region=${state.awsRegion}`)
        console.log(`Copy the "API Gateway domain name" field and be ready to provide it at the next prompt. The value will look simlar to: <uniqueid>.execute-api.${state.awsRegion}.amazonaws.com`)
        await utils.askSpecific(rl, 'Press "y" when you have this value, or ctrl+c to exit and revisit later.', ['y'])
        state.apiGatewayBackendDomain = await utils.askPattern(rl, 'API Gateway domain name', /.+/)
    },

    handle_aws_deploy: async (rl, state) => {
        console.log('Deploying resources to AWS...')
        console.log('Copying serverless config file to the root of the project...')
        console.log(`Copying ./work/serverless.${state.deploymentName}.yml to ../serverless.${state.deploymentName}.yml`)
        execSync(`cp ./work/serverless.${state.deploymentName}.yml ../serverless.${state.deploymentName}.yml`, {cwd: './', stdio: 'inherit'})

        console.log('Copying Okta API private key to the udap_pki folder...')
        console.log(`Copying ./work/${state.oktaApiClientPrivateKeyFile} to ../udap_pki/${state.oktaApiClientPrivateKeyFile}`)
        execSync(`cp ./work/${state.oktaApiClientPrivateKeyFile} ../udap_pki/${state.oktaApiClientPrivateKeyFile}`, {cwd: './', stdio: 'inherit'})

        await utils.askSpecific(rl, 'Press "y" when you are ready to finish AWS deployment (this will take 10-15 minutes), or ctrl+c to exit and revisit later.', ['y'])
        execSync(`serverless deploy --verbose -c serverless.${state.deploymentName}.yml`, {cwd: '../', stdio: 'inherit'})
    },

    handle_update_domain_cname: async (rl, state) => {
        console.log('Manual step to update DNS CNAME resolution for your custom domain...')
    
        
        console.log('Open the following URL in your brower to determine the new CNAME value:')
        console.log('Note- the goal here is to point your base authorization domain at the cloudfront distribution we\'ve created.')
        console.log(`https://${state.awsRegion}.console.aws.amazon.com/cloudfront/v3/home?region=${state.awsRegion}#/distributions`)
        console.log('Locate the "DomainName" field - it will be similar to: <uniqueid>.cloudfront.net.')
        console.log(`Please update your CNAME record for ${state.baseDomain} to this value.`)

        await utils.askSpecific(rl, `Press "y" when you have updated your DNS CNAME record or ctrl+c to exit and revisit later.`, ['y'])
    }
}