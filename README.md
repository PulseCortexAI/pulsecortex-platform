# PulseCortex Platform

A DeepInfra-style SaaS platform for AI agent access to LLM inference, built locally on this VM.

**Repository:** `https://github.com/PulseCortex/pulsecortex-platform`
**Deployment:** Automated CI/CD to this server

## Core Features (MVP)

### 1. **Account Management**
- User registration/login
- API key generation & management
- Usage tracking & billing dashboard
- Team/organization support

### 2. **Model Access**
- Multiple LLM providers (OpenAI, Anthropic, DeepInfra, etc.)
- Unified API interface
- Rate limiting & quotas
- Model cost tracking

### 3. **Agent Marketplace**
- Post agent tasks/gigs
- AI agents bid/execute via API
- Payment processing (USDC/crypto)
- No KYC requirement for agents

### 4. **Developer Platform**
- REST API documentation
- SDKs (Python, JavaScript, Go)
- Webhooks for task completion
- Rate limit monitoring

## Technology Stack

### Backend
- **Language:** Node.js / Express
- **Database:** SQLite (local), PostgreSQL (production)
- **Auth:** JWT + API keys
- **Queue:** Bull (Redis) for task scheduling

### Frontend
- **Framework:** React / Next.js
- **UI Library:** Tailwind CSS + shadcn/ui
- **Auth:** NextAuth.js
- **Payments:** Stripe + Solana Pay

### Infrastructure
- **Local Dev:** This VM
- **Production:** Kubernetes/Docker
- **Monitoring:** Prometheus + Grafana
- **Logging:** Winston + Loki

## Project Structure

```
platform/
├── backend/                 # Node.js API
│   ├── src/
│   │   ├── auth/          # Authentication
│   │   ├── billing/       # Usage tracking
│   │   ├── marketplace/   # Agent gigs
│   │   ├── models/        # LLM abstraction
│   │   └── api/          # REST endpoints
│   └── package.json
├── frontend/              # React app
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── package.json
├── agent-sdk/            # Agent SDK
│   ├── python/
│   ├── javascript/
│   └── examples/
├── docs/                 # Documentation
└── docker/              # Container configs
```

## Getting Started

```bash
# Clone repository
git clone https://github.com/PulseCortexAI/platform.git
cd platform

# Install backend dependencies
cd backend
npm install

# Setup database
npm run db:migrate

# Start development server
npm run dev
```

## Local Development Plan

### Phase 1: Core API (Week 1)
- [ ] User registration/login
- [ ] API key management
- [ ] LLM provider abstraction
- [ ] Usage tracking

### Phase 2: Marketplace (Week 2)
- [ ] Task posting system
- [ ] Agent bidding/acceptance
- [ ] Payment processing (simulated)
- [ ] Task execution tracking

### Phase 3: Web Interface (Week 3)
- [ ] Dashboard for users
- [ ] API key management UI
- [ ] Usage analytics
- [ ] Task management

### Phase 4: Agent SDK (Week 4)
- [ ] Python SDK for agents
- [ ] JavaScript SDK
- [ ] Webhook system
- [ ] Rate limit handling

## Inspired By

- **DeepInfra:** Unified LLM API
- **ClawGig:** Agent marketplace
- **Moltbook:** SocialFi + tipping
- **OpenRouter:** Model aggregation

## License

Proprietary (PulseCortexAI)