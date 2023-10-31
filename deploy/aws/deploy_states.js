const STATE_GENERATE_DEPLOY_CREDENTIALS = 'generate_deployment_credentials'
const STATE_QUESTIONNAIRE = 'deploy_questionnaire'
const STATE_OKTA_DEPLOY = 'deploy_okta'
const STATE_OKTA_CREATE_CUSTOM_DOMAIN = 'okta_create_custom_domain'
const STATE_OKTA_VERIFY_CUSTOM_DOMAIN = 'okta_verify_custom_domain'
const STATE_GENERATE_SERVERLESS_CONFIG_FILE = 'generate_serverless_config'
const STATE_AWS_CERTS = 'aws_certs'
const STATE_AWS_CUSTOM_DOMAIN = 'aws_custom_domain'
const STATE_COLLECT_AWS_API_GATEWAY_DOMAIN = 'collect_aws_api_gateway_domain'
const STATE_AWS_DEPLOY = 'aws_deploy'
const STATE_UPDATE_DOMAIN_CNAME = 'update_domain_cname'
const STATE_FINISHED = 'finished'

module.exports.states = [
    STATE_GENERATE_DEPLOY_CREDENTIALS,
    STATE_QUESTIONNAIRE,
    STATE_OKTA_DEPLOY,
    STATE_OKTA_CREATE_CUSTOM_DOMAIN,
    STATE_OKTA_VERIFY_CUSTOM_DOMAIN,
    STATE_AWS_CERTS,
    STATE_AWS_CUSTOM_DOMAIN,
    STATE_COLLECT_AWS_API_GATEWAY_DOMAIN,
    STATE_GENERATE_SERVERLESS_CONFIG_FILE,
    STATE_AWS_DEPLOY,
    STATE_UPDATE_DOMAIN_CNAME,
    STATE_FINISHED
]

module.exports.specificStateVariables = {
    apiGatewayBackendDomain: '',
    awsRegion: ''    
}