const STATE_GENERATE_DEPLOY_CREDENTIALS = 'generate_deployment_credentials'

const STATE_QUESTIONNAIRE = 'deploy_questionnaire'
const STATE_CLOUD_QUESTIONNAIRE = 'deploy_cloud_questionnaire'
const STATE_OAUTH_QUESTIONNAIRE = 'deploy_oauth_questionnaire'
const STATE_OAUTH_DEPLOY = 'deploy_oauth'
const STATE_OAUTH_CREATE_CUSTOM_DOMAIN = 'oauth_create_custom_domain'
const STATE_OAUTH_VERIFY_CUSTOM_DOMAIN = 'oauth_verify_custom_domain'
const STATE_GENERATE_SERVERLESS_CONFIG_FILE = 'generate_serverless_config'
const STATE_CLOUD_CERTS = 'setup_cloud_platform_certs'
const STATE_CLOUD_CUSTOM_DOMAIN = 'setup_cloud_platform_custom_domain'
const STATE_CLOUD_DEPLOY_PRESTEP = 'cloud_deploy_manual_prestep'
const STATE_CLOUD_DEPLOY = 'cloud_deploy'
const STATE_UPDATE_DOMAIN_CNAME = 'update_domain_cname'
const STATE_FINISHED = 'finished'

module.exports.states = [
    STATE_QUESTIONNAIRE,
    STATE_CLOUD_QUESTIONNAIRE,
    STATE_GENERATE_DEPLOY_CREDENTIALS,
    STATE_OAUTH_QUESTIONNAIRE,
    STATE_OAUTH_DEPLOY,
    STATE_OAUTH_CREATE_CUSTOM_DOMAIN,
    STATE_OAUTH_VERIFY_CUSTOM_DOMAIN,
    STATE_CLOUD_CERTS,
    STATE_CLOUD_CUSTOM_DOMAIN,
    STATE_CLOUD_DEPLOY_PRESTEP,
    STATE_GENERATE_SERVERLESS_CONFIG_FILE,
    STATE_CLOUD_DEPLOY,
    STATE_UPDATE_DOMAIN_CNAME,
    STATE_FINISHED
]

module.exports.initialState = STATE_QUESTIONNAIRE

module.exports.finalState = STATE_FINISHED

