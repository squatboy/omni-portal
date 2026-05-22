# IPAM

## Scope

- IPAM data is stored in PostgreSQL as `Location -> Network -> Subnet -> IP`.
- `Network` is a logical group inside a Location, not a CIDR owner.
- Viewer routes are under `/api/ipam/*` and require login.
- Admin mutation routes are under `/api/manage/ipam/*`.
- Scanner and scheduler behavior is not implemented in Task 1.

## Backend API

- `GET /api/ipam/summary`
- `GET /api/ipam/locations`
- `GET /api/ipam/networks?locationId=...`
- `GET /api/ipam/subnets?locationId=...&networkId=...`
- `GET /api/ipam/subnets/:id/addresses`
- `POST /api/manage/ipam/locations`
- `PUT /api/manage/ipam/locations/:id`
- `DELETE /api/manage/ipam/locations/:id`
- `POST /api/manage/ipam/networks`
- `PUT /api/manage/ipam/networks/:id`
- `DELETE /api/manage/ipam/networks/:id`
- `POST /api/manage/ipam/subnets`
- `PUT /api/manage/ipam/subnets/:id`
- `DELETE /api/manage/ipam/subnets/:id`
- `PUT /api/manage/ipam/addresses/:id`

## Validation

- Subnet CIDR supports IPv4 only.
- Subnet CIDR must be `/24` or smaller.
- Subnet CIDR is immutable after creation.
- Subnet CIDR overlap is blocked across the whole Location, even when Networks differ.
- Subnet creation generates usable host IP rows:
  - `/24` through `/30`: network and broadcast addresses are excluded.
  - `/31` and `/32`: all addresses are retained.
- IP status values are `active`, `dead`, `offline`.
- Auto Discovery interval values are `1800`, `3600`, `14400`, `43200`, `86400` seconds; default is `3600`.

## Delete Behavior

- Location, Network, and Subnet deletes rely on PostgreSQL FK cascade.
- Deleting a Location deletes its Networks, Subnets, and IP rows.
- Deleting a Network deletes its Subnets and IP rows.
- Deleting a Subnet deletes its IP rows.
