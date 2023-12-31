module.exports.newUdapAppModel = {
    "is_token_endpoint_ip_header_trusted": false,
    "name": "",
    "logo_uri": "",
    "is_first_party": true,
    "oidc_conformant": true,
    "sso_disabled": false,
    "cross_origin_auth": false,
    "refresh_token": {
      "expiration_type": "non-expiring",
      "leeway": 0,
      "infinite_token_lifetime": true,
      "infinite_idle_token_lifetime": true,
      "token_lifetime": 31557600,
      "idle_token_lifetime": 2592000,
      "rotation_type": "non-rotating"
    },
    "allowed_clients": [],
    "callbacks": [],
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
    "client_aliases": [],
    "app_type": "",
    "grant_types": [
      "authorization_code",
      "refresh_token",
      "client_credentials"
    ],
    "custom_login_page_on": true
  }

  module.exports.newUdapAppCredential = {
    "credential_type": "public_key",
    "name": "",
    "pem": "",
    "alg": "RS256",
    "parse_expiry_from_cert": false
  }