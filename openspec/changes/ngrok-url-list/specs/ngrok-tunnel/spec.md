## ADDED Requirements

### Requirement: Copyable URL list
The Ngrok status API and dashboard SHALL expose a list of URLs that operators can copy: the local proxy URL and every known public tunnel URL.

#### Scenario: Status includes local and public URLs
- **WHEN** a client calls `GET /api/ngrok`
- **THEN** the response includes `localUrl` (loopback proxy URL for the listen port) and `publicUrls` (array of public tunnel URLs, https preferred first)
- **AND** `publicUrl` remains the preferred single public HTTPS URL when available
- **AND** the response never includes the raw auth token

#### Scenario: Dashboard lists each URL with Copy
- **WHEN** the operator opens the Ngrok page
- **THEN** the page shows a URL list with the local URL and each public URL
- **AND** each row has a Copy control that copies that row’s URL
- **AND** when no public URLs exist, the public row shows an empty-state message with Copy disabled

#### Scenario: Last public URLs remain copyable after stop
- **WHEN** the tunnel is stopped after a successful start
- **THEN** previously discovered public URLs remain available for copy until replaced by a later tunnel session
