const utils = require('../deploy_utils')
const YAML = require('yaml')
const fs = require('fs')
const execSync = require('child_process').execSync;

const SERVERLESS_AWS_EXAMPLE_CONFIG = './aws/{platform}/serverless-example.yml'

module.exports.specificStateVariables = {
    apiGatewayBackendDomain: '',
    awsRegion: ''    
}

module.exports.handlers = {
    handle_deploy_cloud_questionnaire: async (rl, state) => {
        console.log('Collecting cloud platform information...')

        state.awsRegion = await utils.askPattern(rl, 'What AWS region are you deploying in? (Example: us-east-1)', /.+/)

        console.log('All set! Current configuration:')
        console.log(state)
    },

    handle_generate_serverless_config: async (rl, state) => {
        const serverlessConfigFile= `./work/serverless.${state.deploymentName}.yml`
        const exampleServerlessConfigFile = SERVERLESS_AWS_EXAMPLE_CONFIG.replace('{platform}',state.oauthPlatform)

        console.log(`Reading example serverless config at: ${exampleServerlessConfigFile}`)
        var serverlessConfig = YAML.parse(fs.readFileSync(exampleServerlessConfigFile, 'utf-8'));
        
        serverlessConfig.service = `${serverlessConfig.service}-${state.deploymentName}`
        serverlessConfig.params.default.AWS_REGION = state.awsRegion
        serverlessConfig.params.default.BASE_DOMAIN = state.baseDomain
        const domainParts = state.baseDomain.split('.')
        serverlessConfig.params.default.BASE_TLD = `${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}.`
        serverlessConfig.params.default.FHIR_BASE_URL = state.fhirBaseUrl
    
        serverlessConfig.params.default.OAUTH_ORG = state.oauthServiceBaseDomain
        serverlessConfig.params.default.OAUTH_CUSTOM_DOMAIN_NAME_BACKEND = state.oauthCustomDomainBackendDomain

        serverlessConfig.params.default.OAUTH_CUSTOM_DOMAIN_NAME_APIKEY = state.oauthCustomDomainApiKey

        serverlessConfig.params.default.API_GATEWAY_DOMAIN_NAME_BACKEND = state.apiGatewayBackendDomain

        serverlessConfig.params.default.OAUTH_CLIENT_ID = state.oauthRuntimeAPIClientId
        serverlessConfig.params.default.OAUTH_PRIVATE_KEY_FILE = `udap_pki/${state.oauthRuntimeAPIPrivateKeyFile}`

        serverlessConfig.params.default.COMMUNITY_CERT = state.udapCommunityCertFile
        serverlessConfig.params.default.SERVER_KEY = state.udapMemberP12File
        serverlessConfig.params.default.SERVER_KEY_PWD = state.udapMemberP12Pwd
        serverlessConfig.params.default.ORGANIZATION_NAME = state.udapOrganizationName
        serverlessConfig.params.default.ORGANIZATION_ID = state.udapOrganizationId

        serverlessConfig.params.default.PURPOSE_OF_USE = state.udapPurposeOfUse

        serverlessConfig.params.default.OAUTH_RESOURCE_SERVER_ID = state.fhirResourceServerId

        serverlessConfig.params.default.LOGO_URI = state.logoUri

        console.log(`Writing new config file at: ${serverlessConfigFile}`)
        fs.writeFileSync(serverlessConfigFile, YAML.stringify(serverlessConfig), 'utf-8');
    },

    handle_setup_cloud_platform_certs: async (rl, state) => {
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

    handle_setup_cloud_platform_custom_domain: async (rl, state) => {
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

    handle_cloud_deploy_manual_prestep: async (rl, state) => {
        console.log('Manual step to configure the custom domain in AWS API Gateway...')
        console.log('In order to finalize our AWS setup, we need the API gateway internal domain name for the custom domain we just created.')
        console.log('To get this value, visit the following URL:')
        console.log(`https://${state.awsRegion}.console.aws.amazon.com/apigateway/main/publish/domain-names?domain=${state.baseDomain}&region=${state.awsRegion}`)
        console.log(`Copy the "API Gateway domain name" field and be ready to provide it at the next prompt. The value will look simlar to: <uniqueid>.execute-api.${state.awsRegion}.amazonaws.com`)
        await utils.askSpecific(rl, 'Press "y" when you have this value, or ctrl+c to exit and revisit later.', ['y'])
        state.apiGatewayBackendDomain = await utils.askPattern(rl, 'API Gateway domain name', /.+/)
    },

    handle_cloud_deploy: async (rl, state) => {
        console.log('Deploying resources to AWS...')
        console.log('Copying serverless config file to the root of the project...')
        console.log(`Copying ./work/serverless.${state.deploymentName}.yml to ../serverless.${state.deploymentName}.yml`)
        execSync(`cp ./work/serverless.${state.deploymentName}.yml ../serverless.${state.deploymentName}.yml`, {cwd: './', stdio: 'inherit'})

        console.log('Copying OAuth API private key to the udap_pki folder...')
        console.log(`Copying ./work/${state.oauthRuntimeAPIPrivateKeyFile} to ../udap_pki/${state.oauthRuntimeAPIPrivateKeyFile}`)
        execSync(`cp ./work/${state.oauthRuntimeAPIPrivateKeyFile} ../udap_pki/${state.oauthRuntimeAPIPrivateKeyFile}`, {cwd: './', stdio: 'inherit'})

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