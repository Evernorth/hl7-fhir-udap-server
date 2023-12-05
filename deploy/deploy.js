//This script is intended to be a guided process for deploying all of the required configurations and infrastructue for supporting SMART/FHIR with OAuth.
const readline = require('readline');
const fs = require('fs');

//Non platform specific deploy helpers.
const utils = require('./deploy_utils')
const STATE_FILE = './work/state'
const STATE_FINISHED = 'finished'
const STATE_GENERATE_DEPLOY_CREDENTIALS = 'generate_deployment_credentials'

const SUPPORTED_CLOUD_PLATFORMS = ['aws']

var state = {}

main()

async function main() {
    const rl = readline.createInterface(process.stdin, process.stdout);
    var newDeployment = false
    try {
        state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        if(state.currentStep == STATE_FINISHED) {
            const newDeploy = await utils.askSpecific(rl, 'An existing finished deployment was found. Start a new deployment?', ['y','n'])
            if(newDeploy == 'n') {
                await handlers['handle_finished'](rl, state)
            }
            else {
                console.log('Starting new deployment.')
                newDeployment = true
                state = {}
            }
        }
        else {
            const continueDeploy = await utils.askSpecific(rl, `An existing in-process deployment was found. Continue that deployment (Next step is ${state.currentStep})?`, ['y','n'])
            if(continueDeploy == 'n') {
                newDeployment = true
                state = {}
            }
        }
    }
    catch(err) {
        console.log('No in-process deployment found. Starting with a new deployment!')
        newDeployment = true
    }


    //Load all of our resources for the selected cloud platform and selected OAuth platform.
    const chosenCloudPlatform = state.cloudPlatform ? state.cloudPlatform : await utils.askSpecific(rl, 'Which cloud platform would you like to deploy to?', SUPPORTED_CLOUD_PLATFORMS)
 
    //Platform specific deploy helpers.
    const additionalStates = require(`./${chosenCloudPlatform}/deploy_states`).specificStateVariables
    const states = require(`./${chosenCloudPlatform}/deploy_states`).states
    const platformDeployHandlers = require(`./${chosenCloudPlatform}/deploy_handlers`).handlers

    const chosenOAuthPlatform = state.oauthPlatform ? state.oauthPlatform : await utils.askSpecific(rl, 'Which OAuth platform would you like to deploy to?', ['okta','auth0'])

    const oauthDeployHandlers = require(`./${chosenOAuthPlatform}/deploy_handlers`).handlers

    const handlers = {
        ...oauthDeployHandlers,
        ...platformDeployHandlers
    }

    const deploymentName = state.deploymentName ? state.deploymentName : await utils.askPattern(rl, 'What would you like to name your deployment? This name is appended to all objects in your chosen OAuth platform, and is also appended to all objects in AWS for easy association (Example: SMARTv1)', /.+/)

    if(newDeployment) {
        state = initState(additionalStates, chosenCloudPlatform, chosenOAuthPlatform, deploymentName)
    }

    console.log('Starting deployment tasks...')
    console.log('Current task: ' + state.currentStep)
    while(state.currentStep != STATE_FINISHED) {
        console.log('Processing deployment task: ' + state.currentStep)
        await handlers[`handle_${state.currentStep}`](rl, state)

        console.log('Deployment task complete. Saving state...')
        state.currentStep = states[states.indexOf(state.currentStep) + 1]
        saveState(state)

        const continueNext = await utils.askSpecific(rl, `Would you like to continue on to the next step (${state.currentStep})?`, ['y','n'])
        if(continueNext == 'n') {
            break
        }
    }
    if(state.currentStep == STATE_FINISHED) {
        await handlers['handle_finished'](rl, state)
    }
    rl.close()
    return
}

function initState(additionalStates, chosenCloudPlatform, chosenOAuthPlatform, deploymentName) {
    return {
        cloudPlatform: chosenCloudPlatform,
        oauthPlatform: chosenOAuthPlatform,
        currentStep: STATE_GENERATE_DEPLOY_CREDENTIALS,
        deploymentName: deploymentName,
        smartVersionScopes: '',
        baseDomain: '',
        fhirBaseUrl: '',
        oauthDomain: '',
        oauthCustomDomainId: '',
        auth0CustomDomainApiKey: '',
        oauthCustomDomainBackendDomain: '',
        oauthDeployMgmtClientId: '',
        oauthDeployMgmtPrivateKeyFile: '',
        oauthApiClientId: '',
        oauthApiClientPrivateKeyFile: '',
        oauthResourceServerId: '',
        udapCommunityCertFile: '',
        udapMemberP12File: '',
        udapMemberP12Pwd: '',
        udapOrganizationName: '',
        udapOrganizationId: '',
        udapPurposeOfUse: '',
        ...additionalStates
    }
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
}