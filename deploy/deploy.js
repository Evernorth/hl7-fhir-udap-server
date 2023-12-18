//This script is intended to be a guided process for deploying all of the required configurations and infrastructue for supporting SMART/FHIR with OAuth.
const readline = require('readline');
const fs = require('fs');

//Non platform specific deploy helpers.
const utils = require('./deploy_utils')
const states = require(`./deploy_states`).states
const initialState = require(`./deploy_states`).initialState
const finalState = require(`./deploy_states`).finalState
const STATE_FILE = './work/state'

const SUPPORTED_CLOUD_PLATFORMS = ['aws']
const SUPPORTED_OAUTH_PLATFORMS = ['okta','auth0']

var state = {}

main()

async function main() {
    const rl = readline.createInterface(process.stdin, process.stdout);
    var newDeployment = false
    try {
        state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        if(state.currentStep == finalState) {
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

    if(newDeployment) {
        //Init new state based upon our chosen oauth and cloud platform.
        //We need to ask this stuff first because everything else depends upon it.
        const chosenCloudPlatform = state.cloudPlatform ? state.cloudPlatform : await utils.askSpecific(rl, 'Which cloud platform would you like to deploy to?', SUPPORTED_CLOUD_PLATFORMS)
        const chosenOAuthPlatform = state.oauthPlatform ? state.oauthPlatform : await utils.askSpecific(rl, 'Which OAuth platform would you like to deploy to?', SUPPORTED_OAUTH_PLATFORMS)

        const globalPlatformStates = require(`./deploy_handlers`).specificStateVariables
        const additionalPlatformStates = require(`./${chosenCloudPlatform}/deploy_handlers`).specificStateVariables
        const additionalOauthStates = require(`./${chosenCloudPlatform}/deploy_handlers`).specificStateVariables

        state = initState(globalPlatformStates, additionalPlatformStates, additionalOauthStates)
        state.cloudPlatform = chosenCloudPlatform,
        state.oauthPlatform = chosenOAuthPlatform,
        state.currentStep = initialState
    }

    //We need to load up our chosen handlers every time- even if we're loading an in-flight deployment.
    const globalDeployHandlers = require(`./deploy_handlers`).handlers
    const platformDeployHandlers = require(`./${state.cloudPlatform}/deploy_handlers`).handlers
    const oauthDeployHandlers = require(`./${state.oauthPlatform}/deploy_handlers`).handlers

    const handlers = {
        ...globalDeployHandlers,
        ...oauthDeployHandlers,
        ...platformDeployHandlers
    }

    console.log('Starting deployment tasks...')
    console.log('Current task: ' + state.currentStep)
    while(state.currentStep != finalState) {
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
    if(state.currentStep == finalState) {
        await handlers['handle_finished'](rl, state)
    }
    rl.close()
    return
}
function initState(globalStates, cloudStates, oauthStates) {
    return  {
        ...globalStates,
        ...cloudStates,
        ...oauthStates
    }

}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
}