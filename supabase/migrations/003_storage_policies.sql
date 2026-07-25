-- Optional helper view for app-level reads.
create or replace view public.user_workspace as
select
    up.id as user_id,
    up.display_name,
    up.email,
    up.business_name,
    up.currency,
    up.language,
    up.date_format,
    up.number_format,
    up.activity_tracking,
    up.notification_preferences,
    ws.profile,
    ws.expenses,
    ws.inventory_meta
from public.user_profiles up
left join public.workspace_snapshots ws on ws.user_id = up.id;

alter view public.user_workspace owner to postgres;
