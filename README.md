# hl7-fhir-udap-server

## Getting Started

For a general overview of UDAP as well as a getting starting guide of the full four-repository collection see [UDAP Documentation](https://github.com/Evernorth/hl7-fhir-udap-docs#readme)

## Overview

This repository is intended to transform by proxy, an industry standard OAuth2 authorization server (Okta and Auth0 references are included) into a UDAP capable authorization server. It is part of a four-repository collection for a full [UDAP](https://www.udap.org/) implementation including a UDAP client, a UDAP server, and all other supporting middleware and libraries. 

This implementation adheres to published Version 1.0 of the [HL7 UDAP Security Implementation Guide](http://hl7.org/fhir/us/udap-security/STU1/).   

The server side components of the following features of the IG are supported:
- [UDAP dynamic client registration](http://hl7.org/fhir/us/udap-security/STU1//registration.html)
- [B2B Authorization](http://hl7.org/fhir/us/udap-security/STU1//b2b.html)
- [B2C Authorization](http://hl7.org/fhir/us/udap-security/STU1//consumer.html)
- [Tiered OAuth](http://hl7.org/fhir/us/udap-security/STU1//user.html) serving both as data holder and/or as CSP/IDP

Links to the other repositories in the collection:
- [hl7-fhir-udap-common](https://github.com/Evernorth/hl7-fhir-udap-common#readme)
- [hl7-fhir-udap-client](https://github.com/Evernorth/hl7-fhir-udap-client#readme)
- [hl7-fhir-udap-test-client-ui](https://github.com/Evernorth/hl7-fhir-udap-test-client-ui#readme)

# Deployment Architecture
![Deployment Architecture](./images/DetailedArch.png)

## Endpoints
This entire project is managed by the [serverless framework](https://www.serverless.com/), which is an easy way to manage numerous cloud resources as a single unit. The codebase was developed for and primarily tested with AWS technologies.

This repository includes the following high-level endpoints:
- **/authorize**: This endpoint supports the tiered oauth flow as the data holder. It is responsible for performing dynamic client registration with the upstream IDP/CSP prior to passing control to the backend authorization server (Okta/Auth0).

- **/register**: This endpoint will accept an inbound, UDAP compliant software statement JWT from a client. The JWT will be validated according to the UDAP specification, and then the appropriate actions will be taken within the backend authorization service (Okta/Auth0).

- **/token:** This endpoint is a minimal proxy on top of the backend authorization server's /token endpoint. It is responsible for performing PKI community validation on the inbound /token request in addition to the industry standard private_key_jwt authentication that authorization servers already handle.

- **/tiered_token_client:** This endpoint is used when serving as a tiered-oauth data holder. It serves as a proxy to ensure that /token requests to the upstream IDP/CSP are UDAP compliant. It leverages the [hl7-fhir-udap-client](https://github.com/Evernorth/hl7-fhir-udap-client#readme) library.

- **/.well-known/udap:** When serving as an IDP/CSP, there is a requirement to host a .well-known/udap endpoint, which can be used by clients to discover server capabilities.

## Usage

To deploy this solution, you must have the following pre-requisites ready to go:

- An OAuth2 authorization service to enhance:
    - Okta (a free tenant is available at [Okta's Developer Site](https://developer.okta.com/signup))

    - Auth0 (a free tenant is available at [Auth0's Developer Site](https://auth0.com/signup))
- Node.js
- [serverless framework](https://www.serverless.com/) installed on the machine you're deploying from.
- An AWS tenant to deploy the solution to.
- The base URL of the FHIR service that you wish to secure.
- A domain name that you wish to use as the base URL for the authorization service (for example: udap.your.tld).

## Installation

To assist with the deployment of the overall solution, a guided deployment process has been provided. The automated process performs the following high-level tasks:
* Uses a questionnaire to collect pre-requisite information from you.
* Generates configuration files for automatically deploying Okta/Auth0 resources as well as AWS resources.
* Automatically deploys Okta/Auth0 configuration.
* Automatically deploys AWS configuration.
* Assists with any manual steps that are necessary, such as any DNS updates that need to be made.

Overall, the process is managed in a step-by-step, wizard-like manner with the ability to start/stop the overall process at any point. After each step in the process, the user has the ability to continue, or pause and continue at a later time.

Files managed with the deploy script:
* deploy/work/state: This is a file created by the deploy script that determines what step in the process you're in, is used to start/stop the process, and is used to carry configuration information between the steps.

* /serverless.'deploymentname'.yml: This file will be generated as a copy of /deploy/aws/serverless.example.yml with proper configuration obtained during the deployment process. This may be used for future updates to the components deployed on AWS.

### Step 1- Install deployment dependencies
```bash
cd deploy
npm install
```

### Step 2- Run the deployment script
```bash
node deploy.js
```
Follow the guided process to finish your deployment.

### Post Deployment Management
The automated process was created with the intent of easily creating a UDAP capable authorization server. It was not intended for ongoing maintenance. For ongoing maintenance, it is recommended to use proper CI/CD pipeline processes and/or other officially released maintenance tools.

**For updates to AWS**

To make updates to AWS resources, the serverless.yaml file generated during initial deployment may be used:
```bash
serverless deploy --verbose -c serverless.'deploymentname'.yaml
```

## Known Issues
- This installation of this server automates the retreival of an SSL certificate for the custom domain using [Let's Encrypt](https://letsencrypt.org/).   This SSL certificate is only good for 90 days.
- The Auth0 implementation is less mature than the Okta and should be treated as experimental at this time. 


## Getting Help

If you have questions, concerns, bug reports, etc., file an issue in this repository's Issue Tracker.

## Getting Involved

See the [CONTRIBUTING](CONTRIBUTING.md) file for info on how to get involved.

## License

The hl7-fhir-udap-server is Open Source Software released under the [Apache 2.0 license](https://www.apache.org/licenses/LICENSE-2.0.html).

## Original Contributors

We would like to recognize the following people for their initial contributions to the project: 
 - Tom Loomis, Evernorth
 - Dan Cinnamon, Okta