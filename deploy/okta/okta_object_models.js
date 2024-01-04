module.exports.oktaAPIM2MClientScopes = ['okta.apps.manage','okta.apps.read','okta.idps.read','okta.idps.manage', 'okta.authorizationServers.read', 'okta.authorizationServers.manage', 'okta.profileMappings.read', 'okta.profileMappings.manage']

module.exports.oktaAPIM2MClient = {
    "name": "oidc_client",
    "label": "Okta API M2M Client",
    "features": [],
    "signOnMode": "OPENID_CONNECT",
    "credentials": {
        "oauthClient": {
            "autoKeyRotation": true,
            "token_endpoint_auth_method": "private_key_jwt",
            "pkce_required": false
        }
    },
    "settings": {
        "app": {},
        "oauthClient": {
            "response_types": [
                "token"
            ],
            "grant_types": [
                "client_credentials"
            ],
            "jwks": {
                "keys": []
            },
            "application_type": "service",
            "consent_method": "REQUIRED",
            "issuer_mode": "DYNAMIC",
            "idp_initiated_login": {
                "mode": "DISABLED",
                "default_scope": []
            },
            "wildcard_redirect": "DISABLED"
        }
    }
}

module.exports.fhirUserAttribute = {
    "definitions": {
        "custom": {
            "id": "#custom",
            "type": "object",
            "properties": {
                "fhirUser": {
                    "title": "FHIR User ID",
                    "description": "The user's ID within the FHIR server",
                    "type": "string",
                    "required": false,
                    "permissions": [
                        {
                            "principal": "SELF",
                            "action": "READ_ONLY"
                        }
                    ]
                }
            },
            "required": []
        }
    }
}

module.exports.authzServer = {
    "name": "UDAP Enabled Authorization Server",
    "description": "Demo authorization server to show UDAP support",
    "audiences": [],
    "issuerMode": "DYNAMIC"
}

module.exports.authzScopes = [
    {
        "name": "fhirUser",
        "description": "fhirUser",
        "system": false,
        "default": false,
        "displayName": "fhirUser",
        "consent": "IMPLICIT",
        "metadataPublish": "NO_CLIENTS"
    },
    {
        "name": "udap",
        "description": "udap",
        "system": false,
        "default": false,
        "displayName": "fhirUser",
        "consent": "IMPLICIT",
        "metadataPublish": "NO_CLIENTS"
    }
]
module.exports.smartv1Scopes = [
    {
        "name": "user/Patient.read",
        "description": "Ability to read the selected patient's record",
        "default": false,
        "displayName": "Ability to read the selected patient's record",
        "consent": "REQUIRED",
        "metadataPublish": "NO_CLIENTS"
    },
    {
        "name": "user/Observation.read",
        "description": "Ability to read the selected patient's vital signs",
        "default": false,
        "displayName": "Ability to read the selected patient's vital signs",
        "consent": "REQUIRED",
        "metadataPublish": "NO_CLIENTS"
    },
    {
        "name": "system/Patient.read",
        "description": "Ability to read the selected patient's record",
        "default": false,
        "displayName": "Ability to read the selected patient's record",
        "consent": "FLEXIBLE",
        "metadataPublish": "NO_CLIENTS"
    },
    {
        "name": "system/Observation.read",
        "description": "Ability to read the selected patient's vital signs",
        "default": false,
        "displayName": "Ability to read the selected patient's vital signs",
        "consent": "FLEXIBLE",
        "metadataPublish": "NO_CLIENTS"
    }
]

module.exports.smartv2Scopes = [
    {
        "name": "user/Patient.rs",
        "description": "Ability to read the selected patient's record",
        "default": false,
        "displayName": "Ability to read the selected patient's record",
        "consent": "REQUIRED",
        "metadataPublish": "NO_CLIENTS"
    },
    {
        "name": "user/Observation.rs",
        "description": "Ability to read the selected patient's vital signs",
        "default": false,
        "displayName": "Ability to read the selected patient's vital signs",
        "consent": "REQUIRED",
        "metadataPublish": "NO_CLIENTS"
    },
    {
        "name": "system/Patient.rs",
        "description": "Ability to read the selected patient's record",
        "default": false,
        "displayName": "Ability to read the selected patient's record",
        "consent": "FLEXIBLE",
        "metadataPublish": "NO_CLIENTS"
    },
    {
        "name": "system/Observation.rs",
        "description": "Ability to read the selected patient's vital signs",
        "default": false,
        "displayName": "Ability to read the selected patient's vital signs",
        "consent": "FLEXIBLE",
        "metadataPublish": "NO_CLIENTS"
    }
]

module.exports.authzClaims = [
    {
        "name": "fhirUser",
        "claimType": "IDENTITY",
        "valueType": "EXPRESSION",
        "status": "ACTIVE",
        "value": "user.fhirUser",
        "alwaysIncludeInToken": "TRUE",
        "conditions": {
            "scopes": ["fhirUser"]
        },
        "system": false
    },
    {
        "name": "fhirUser",
        "claimType": "RESOURCE",
        "valueType": "EXPRESSION",
        "status": "ACTIVE",
        "value": "user.fhirUser",
        "alwaysIncludeInToken": "TRUE",
        "conditions": {
            "scopes": ["fhirUser"]
        },
        "system": false
    }
]