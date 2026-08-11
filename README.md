This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Refresh the production IBKR Gateway

The production Gateway runs separately from the Trading Diary application. To open its desktop, create an SSH tunnel and leave the terminal running:

```bash
ssh -i ~/.ssh/id_rsa -N \
  -L 5900:127.0.0.1:5900 \
  root@5.223.53.140
```

Open `vnc://localhost:5900` in a VNC client, enter the Gateway VNC password, and approve the IBKR Mobile/IB Key prompt if requested.

If the Gateway is stuck, restart only its independent container:

```bash
ssh -i ~/.ssh/id_rsa root@5.223.53.140 \
  'cd /srv/tradingdiary && docker compose -p tradingdiary-ibkr -f docker-compose.ibkr.server.yml restart ib-gateway'
```

Reconnect through VNC and complete 2FA. This command does not restart the Trading Diary web application or scanner. For the complete deployment and authentication notes, see [`docs/specs/hybrid-futures-provider-setup.md`](docs/specs/hybrid-futures-provider-setup.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
