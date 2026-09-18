# RepairWorks deliberate defects

Maintainer reference for the [RepairWorks example](../examples/repairworks/README.md). These are planted defects; the payment integration exercises the duplicate-receipt defect, while the remaining catalogue has no JevTest coverage measurement. Keep this document out of model prompts, observations, fixtures, and public task goals.

Use a fresh data file for independent reproductions. The initial account is selected on the local session page; Morgan is a manager, Alex an advisor, and Sam and Charlie are active technicians. Each successful command reloads the page, so repeated submissions below use a fresh form revision.

## Major

1. **Repeated quote lines can over-reserve stock.** Create a Central work order. Check a part's available quantity in Inventory, then add two quote lines for that same part, each within availability but together exceeding it (for example, two quantities of 8 when 12 are available). Send and approve the quote. Each line is checked against the original availability, then both reservations are applied. Expected: validate the aggregate quantity per part before approval. Location: `service.ts`, `quote-approve`.

2. **Riverside repairs consume Central stock.** Create a Riverside order, add one available part, send and approve its quote, assign Sam, and start the repair as Morgan. Compare both locations in Inventory. Riverside's reservation decreases, but Central's on-hand quantity decreases. Expected: consume stock at the repair location. Location: `service.ts`, `repair-start`.

3. **Cancelling a started repair creates saleable inventory.** Start a Central repair with a part, then cancel it with a reason such as “Part installed but device remains beyond repair.” The consumed part returns automatically to on-hand stock. Expected: cancellation alone must not restock a consumed part; a separately verified return would be required. Location: `service.ts`, `order-cancel`.

4. **A payment reference can be recorded twice.** Open an unpaid invoice, record a £10 payment with reference `CARD-NEW-01`, then submit another £10 payment with the same reference. Both entries reduce the balance. Expected: the reference identifies one payment and a duplicate must not create another entry. A duplicate full-balance payment is blocked by the amount guard, so use partial payments. Location: `service.ts`, `payment`.

5. **Multiple refunds can exceed collected payments.** Open a seeded paid invoice as Morgan. Refund 60% of its collected total with one reference, then another 60% with a different reference. Both are accepted. Expected: validate each refund against collected payments minus all previous refunds. Location: `service.ts`, `refund`.

6. **A supplier delivery can be received twice.** On `PO-1001`, receive 2 units with reference `DELIVERY-NEW-01`. Repeat that reference with 2 units after the page reloads. Received quantity and stock increase twice. Expected: a delivery reference is processed once per purchase order. Keep each submission below the remaining order quantity. Location: `service.ts`, `purchase-receive`.

7. **Advisors can grant invoice discounts.** Switch to Alex, open an unpaid invoice, and apply a £5 discount. Both the form and server allow it despite the manager-only discount policy. Expected: refuse the advisor's mutation without changing invoice totals. Location: `service.ts`, `invoice-discount`; `view.ts`, invoice controls.

## Moderate

8. **Inactive technicians receive new assignments.** Open an intake work order as Morgan or Alex and assign Robin Gray (inactive). The assignment succeeds and appears in Team workload. Expected: only active technicians can receive new assignments. Location: `service.ts`, `assign`; `view.ts`, assignment options.

9. **Archived customers receive new work orders.** Create a work order for Birch Music, marked archived in the customer selector. Use a new serial number. Intake succeeds. Expected: preserve historic orders while rejecting new orders for archived customers. Location: `service.ts`, `order-create`; `view.ts`, intake customer options.

## Minor

10. **Search is case-sensitive.** Search work orders for `thinkpad`; seeded `ThinkPad T14` orders disappear. Search `ThinkPad` and they appear. Expected: case-insensitive matching across the supported customer, device, serial, and reference fields. Location: `service.ts`, `searchOrders`.

11. **Priority sort places low-priority work first.** Select Priority in the work-order queue. Alphabetic order puts low before normal before urgent. Expected: urgent, normal, low. Location: `service.ts`, `searchOrders`.

12. **Reorder alerts omit the exact threshold.** Inspect Central thermal compound: available quantity and reorder point are both 3. It does not appear in Overview replenishment alerts. Expected: alert when available stock is less than or equal to the reorder point. Location: `service.ts`, `lowStock`.

## Evaluation boundaries

The normal path, validation errors, stale-form protection, role restrictions unrelated to the planted permission defect, persistence, and rendered pages remain usable. The catalogue is a starting inventory of intentional defects, not a claim that no other problems exist. Ordinary application tests should preserve intended working behavior without treating these defects as correct requirements.

The separate `jevtest/` directory contains two payment flows with independent assertions against persisted records. They run and replay offline through the standard CLI. This example has no registration in the 720-flow benchmark or aggregate scoring code. Broader evaluations must independently define expected outcomes from business requirements and measure exposure before claiming detection.
