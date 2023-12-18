
module.exports.apiM2MClient = {
    "name": "UDAP M2M API",
    "client_authentication_methods": {
        "private_key_jwt": {
          "credentials": []
        }
    },
    "jwt_configuration": {
        "alg": "RS256",
        "lifetime_in_seconds": 36000,
        "secret_encoded": false
    },
    "app_type": "non_interactive",
    "grant_types": [
        "client_credentials"
    ]
}

module.exports.apiM2MClientGrant = {
    "client_id": "",
    "audience": "",
    "scope": [
        "create:clients",
        "update:clients",
        "delete:clients",
        "read:connections",
        "create:connections",
        "update:connections",
        "create:client_credentials",
        "update:client_credentials",
        "read:clients"
    ]
}

module.exports.newUdapAppCredential = {
    "credential_type": "public_key",
    "name": "",
    "pem": "",
    "alg": "RS256",
    "parse_expiry_from_cert": false
}

module.exports.authzServer = {
    "name": "UDAP Protected API",
    "identifier": "",
    "allow_offline_access": true,
    "skip_consent_for_verifiable_first_party_clients": true,
    "token_lifetime": 86400,
    "token_lifetime_for_web": 7200,
    "signing_alg": "RS256",
    "scopes": [
    ],
    "enforce_policies": true,
    "token_dialect": "access_token_authz"
  }

  module.exports.authzScopes = [
    {
        "value": "fhirUser",
        "description": "fhirUser"
    },
    {
        "value": "launch",
        "description": "launch"
    },
    {
        "value": "launch/patient",
        "description": "launch/patient"
    }
]
module.exports.smartv1Scopes = [
    {
        "value": "patient/Patient.read",
        "description": "Ability to read the selected patient's record"
    },
    {
        "value": "patient/Observation.read",
        "description": "Ability to read the selected patient's vital signs"
    }
]

module.exports.smartv2Scopes = [
    {
        "value": "patient/Patient.rs",
        "description": "Ability to read the selected patient's record"
    },
    {
        "value": "patient/Observation.rs",
        "description": "Ability to read the selected patient's vital signs"
    }
]

module.exports.customDomain = {
    "domain": "",
    "type": "self_managed_certs",
    "verification_method": "txt"
}