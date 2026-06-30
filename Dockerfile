FROM apify/actor-node:24

RUN corepack enable

COPY --chown=myuser:myuser package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile \
    && echo "Installed packages:" \
    && pnpm list --prod || true

COPY --chown=myuser:myuser . ./

CMD pnpm start
