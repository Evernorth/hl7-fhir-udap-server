module.exports.newUdapAppModel = {
    'name': 'oidc_client',
    'label': '',
    'signOnMode': 'OPENID_CONNECT',
    'credentials': {
        'oauthClient': {
        'token_endpoint_auth_method': 'private_key_jwt'
        }
    },
    'settings': {
        'implicitAssignment': true,
        'oauthClient': {
            'redirect_uris':'',
            'response_types':'',
            'jwks':'',
            'grant_types': '',
            'application_type': '',
            'consent_method': 'TRUSTED',
            'logo_uri': ''
        }
    },
    'profile': {
        'implicitAssignment': true
    }
}

module.exports.newUdapIdpModel = {
    "type": "OIDC",
    "name": "",
    "protocol": {
    "endpoints": {
      "acs": {
        "binding": "HTTP-POST",
        "type": "INSTANCE"
      },
      "authorization": {
        "binding": "HTTP-REDIRECT",
        "url": ""
      },
      "token": {
        "binding": "HTTP-POST",
        "url": "https://localhost"
      },
      "userInfo": {
        "binding": "HTTP-REDIRECT",
        "url": ""
      },
      "jwks": {
        "binding": "HTTP-REDIRECT",
        "url": ""
      }
    },
      "scopes": [
          "openid", "udap", "email", "profile"
      ],
    "type": "OIDC",
    "credentials": {
      "client": {
          "token_endpoint_auth_method": "private_key_jwt",
          "client_id": ""
      },
    "signing": {
        "algorithm": "RS256"
    }
    },
      "issuer": {
        "url": ""
      }
    },
    "policy": {
    "accountLink": {
        "action": "AUTO",
        "filter": null
    },
    "provisioning": {
      "action": "AUTO",
      "conditions": {
        "deprovisioned": {
            "action": "NONE"
        },
        "suspended": {
            "action": "NONE"
        }
      },
      "groups": {
          "action": "NONE"
      }
    },
      "maxClockSkew": 120000,
    "subject": {
      "userNameTemplate": {
          "template": "idpuser.email"
      },
      "matchType": "USERNAME"
    }
    }
}

module.exports.newUdapAppScopePolicyModel = {
  "name": "Authorization Policy",
  "description": "Ensures that the application can only request the scopes they were approved for at registration time.",
  "priority": 1,
  "system": false,
  "conditions": {
      "clients": {
          "include": []
      }
  },
  "type": "OAUTH_AUTHORIZATION_POLICY"
}

module.exports.newUdapAppScopePolicyRuleModel = {
  "name": "Allow registered scopes",
  "priority": 1,
  "system": false,
  "conditions": {
      "people": {
          "users": {
              "include": [],
              "exclude": []
          },
          "groups": {
              "include": [
                  "EVERYONE"
              ],
              "exclude": []
          }
      },
      "grantTypes": {
          "include": []
      },
      "scopes": {
          "include": []
      }
  },
  "type": "RESOURCE_ACCESS"
}