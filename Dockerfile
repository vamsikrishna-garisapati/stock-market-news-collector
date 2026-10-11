FROM apify/actor-node:24

RUN corepack enable

COPY --chown=myuser:myuser package.json pnpm-lock.yaml ./

# The base image ships its own node_modules (with a newer Crawlee) that conflicts with the lockfile.
RUN rm -rf node_modules \
    && pnpm install --prod --frozen-lockfile \
    && echo "Installed packages:" \
    && pnpm list --prod || true

COPY --chown=myuser:myuser . ./

CMD ["pnpm", "start"]
