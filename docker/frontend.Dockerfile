FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js styles.css /usr/share/nginx/html/
COPY vendor /usr/share/nginx/html/vendor
