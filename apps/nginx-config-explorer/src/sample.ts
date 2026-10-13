/** A small but realistic nginx -T dump for "Try a sample config". */
export const SAMPLE_NAME = "sample-nginx-T.txt";

export const SAMPLE_DUMP = `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
# configuration file /etc/nginx/nginx.conf:
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 768;
    multi_accept on;
}

http {
    # Basic settings
    sendfile on;
    tcp_nopush on;
    types_hash_max_size 2048;
    server_tokens off;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    log_format main '$remote_addr - $remote_user [$time_local] "$request" $status';
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;
    gzip on;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    upstream app_backend {
        server 10.0.1.12:8080 max_fails=3 fail_timeout=10s;
        server 10.0.1.13:8080 max_fails=3 fail_timeout=10s;
        keepalive 32;
    }

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}

# configuration file /etc/nginx/modules-enabled/50-mod-http-geoip2.conf:
load_module modules/ngx_http_geoip2_module.so;

# configuration file /etc/nginx/mime.types:
types {
    text/html html htm shtml;
    text/css css;
    text/xml xml;
    image/gif gif;
    image/jpeg jpeg jpg;
    application/javascript js;
    application/json json;
    image/png png;
    image/svg+xml svg svgz;
    image/webp webp;
    font/woff2 woff2;
    application/pdf pdf;
}

# configuration file /etc/nginx/conf.d/rate-limit.conf:
# Shared zones for the API
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=perip:10m;

# configuration file /etc/nginx/sites-enabled/example.com:
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com www.example.com;
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include snippets/security-headers.conf;
    root /var/www/example.com/public;

    location / {
        try_files $uri $uri/ @app;
    }

    location @app {
        proxy_pass http://app_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        limit_req zone=api burst=20 nodelay;
        limit_conn perip 20;
        proxy_read_timeout 60s;
        proxy_pass http://app_backend;
    }

    location = /healthz {
        access_log off;
        content_by_lua_block {
            -- quick liveness probe
            ngx.header["Content-Type"] = "application/json"
            ngx.say('{"ok": true}')
        }
    }

    location ~* \\.(css|js|png|svg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
}

# configuration file /etc/nginx/snippets/security-headers.conf:
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Strict-Transport-Security "max-age=31536000" always;

# configuration file /etc/nginx/sites-enabled/admin.internal:
server {
    listen 8443 ssl;
    server_name admin.internal;
    allow 10.0.0.0/8;
    deny all;

    location / {
        auth_basic "Restricted";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass http://127.0.0.1:9000;
    }
}
`;
