// Public payment tasks use synthetic receipt data; each flow starts with an isolated workshop.
import type { Flow } from '../../../src/types.js'

export const paymentFlows = (baseUrl: string): Flow[] => [
  {
    id: 'record-one-payment',
    goal: 'Record a £10 payment for invoice INV-1017 using receipt CARD-DEMO-001.',
    startUrl: `${baseUrl}/invoices/INV-1017`,
    fixtures: { invoiceId: 'INV-1017', reference: 'CARD-DEMO-001', amount: '10.00' },
    successCriteria: [
      'Exactly one £10 payment is recorded with the supplied receipt reference.',
      'The outstanding balance decreases by exactly £10.',
      'Invoice prices, refunds, and unrelated workshop records are unchanged.',
    ],
  },
  {
    id: 'retry-payment-receipt',
    goal: 'Record a £10 payment for invoice INV-1017 using receipt CARD-DEMO-001, then retry that same receipt. It must only be credited once.',
    startUrl: `${baseUrl}/invoices/INV-1017`,
    fixtures: { invoiceId: 'INV-1017', reference: 'CARD-DEMO-001', amount: '10.00' },
    successCriteria: [
      'Retrying a receipt leaves exactly one £10 payment with that reference.',
      'The outstanding balance decreases by exactly £10 across both submissions.',
      'Invoice prices, refunds, and unrelated workshop records are unchanged.',
    ],
  },
]
