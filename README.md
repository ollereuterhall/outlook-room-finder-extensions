# Outlook Room Finder Filters

A small Chrome extension that adds optional filters to the Outlook Web Room Finder and allows detected room names to wrap onto multiple lines.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this project folder.
4. Open or refresh Outlook (`https://outlook.office.com/` or `https://outlook.cloud.microsoft/`) and open Room Finder.

Click the extension's toolbar icon to open a compact popup with the on/off toggle and configurable phrase filters.

Left-click the extension icon to open its popup. Toggle special filters, add named include/exclude phrase filters, and choose whether long room names wrap. Settings are stored locally and apply to open Room Finder pages.



## Filters

Create named phrase filters in the toolbar popup. **Keep rooms matching any phrase** includes matching rooms; **Hide rooms matching any phrase** excludes matching rooms. Each filter can contain multiple phrases, one per line. A new installation starts with one **Teams** example filter. **Only available** remains a built-in Room Finder filter, and **Wrap long room names** can be toggled independently.

Outlook's **Clear filters** button also clears all three extension filters.

Filter choices apply only until the page is reloaded. The extension only appears while Room Finder is open and only filters or changes names in its room results list. It does not import room data, make bookings, or change Outlook data.