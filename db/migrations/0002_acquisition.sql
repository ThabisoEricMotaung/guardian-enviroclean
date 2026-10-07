-- Guardian Enviroclean — where a customer originally found Guardian.
--
-- Kept separate from `source` (how the enquiry entered the system): a
-- Facebook visitor who submits the website form is source = 'WEBSITE',
-- acquisition_channel = 'FACEBOOK'. See docs/handover.md, "Facebook setup".
--
-- Both columns are nullable with no default, so existing rows are left
-- untouched (NULL = unknown — there is deliberately no 'DIRECT').
-- The public website only ever writes FACEBOOK; OTHER is reserved for
-- deliberate manual classification. A placement is only meaningful for
-- Facebook, so acquisition_detail requires acquisition_channel = 'FACEBOOK'.

alter table jobs
  add column acquisition_channel text
    constraint jobs_acquisition_channel_check
    check (acquisition_channel in ('FACEBOOK', 'OTHER')),
  add column acquisition_detail text
    constraint jobs_acquisition_detail_check
    check (acquisition_detail in ('page_button', 'post', 'bio')),
  -- `is not distinct from`, not `=`: with a NULL channel, `=` yields NULL,
  -- which a check constraint treats as passing.
  add constraint jobs_acquisition_detail_requires_facebook_check
    check (acquisition_detail is null or acquisition_channel is not distinct from 'FACEBOOK');

comment on column jobs.acquisition_channel is
  'Where the customer originally found Guardian (FACEBOOK / OTHER). NULL = unknown. Distinct from source (entry method).';
comment on column jobs.acquisition_detail is
  'Known Facebook placement (page_button / post / bio). Only set alongside acquisition_channel = FACEBOOK.';
