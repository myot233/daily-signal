UPDATE settings
SET value = json_set(value, '$.deepseekThinking', 'disabled')
WHERE json_type(value, '$.deepseekThinking') IS NULL;