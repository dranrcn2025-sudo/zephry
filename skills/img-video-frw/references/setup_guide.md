# Img-Video-FRW Setup Guide

## Prerequisites

Before configuring Img-Video-FRW, ensure you have:
- Valid Telegram Bot Token from @BotFather
- API KEY for FRW AI platform
- Stable network connection to `frw2.aiaiartist.com`

## Step 1: Configure API KEY

### 1.1 Get API KEY
Visit [FRW AI Platform](https://frw-dreamaiai-api2.aiaiartist.com) and register for an account to obtain your API KEY.

### 1.2 Set API KEY via Bot Command
Send the following Telegram command:
```
/img_key YOUR_API_KEY
```

Replace `YOUR_API_KEY` with your actual API KEY. The KEY will be cached in `logs/api_keys.txt` until it expires (24 hours).

## Step 2: Configure Config Files

### 2.1 Edit config.toml
Copy `config.example.toml` to `config.toml` and fill in your settings:

```toml
# FRW API Configuration
img_api_base = "https://frw2.aiaiartist.com/api/v1/p0api"
vid_api_base = "https://frw2.aiaiartist.com/api/v1/p0api"
img_app_id = "10001"
vid_app_id = "10002"
img_title = "Image-Video-FRW"
vid_title = "Video-Gen-FRW"
bid = "111"
fee = "10"
img_model = "qwen"
vid_model = "qwen-v4"
img_width = "1376"
img_height = "768"
vid_length = "3"
timeout = "30"
```

### 2.2 Telegram Configuration
Ensure your Telegram bot can access the API endpoints. If using custom endpoints, update accordingly.

## Step 3: Test the Skill

### 3.1 Test Image Generation
```bash
python3 scripts/run.py --action img task-create --prompt "A beautiful landscape" --img_url "https://example.com/landscape.jpg"
```

### 3.2 Test Video Generation
```bash
python3 scripts/run.py --action vid task-create --prompt "A cat walking" --vid_url "https://example.com/cat.mp4"
```

### 3.3 Check Task Status
```bash
python3 scripts/run.py --action img status --task_id img_task60001
```

## Step 4: Maintenance

### 4.1 View Tasks
```bash
# List all image tasks
python3 scripts/run.py --action img list

# List all video tasks
python3 scripts/run.py --action vid list
```

### 4.2 Cleanup
```bash
# Clear old image tasks
python3 scripts/run.py --action img clear

# Clear old video tasks
python3 scripts/run.py --action vid clear
```

## Troubleshooting

### Common Issues

1. **API KEY Error**: Ensure your API KEY is valid and not expired. Refresh it using `/img_key <KEY>`.

2. **Network Issues**: Verify you have access to the FRW API endpoints. Check firewalls and proxy settings.

3. **Task Failed**: Check `logs/error_log.log` for detailed error messages and retry the task.

4. **Timeout**: Increase the `timeout` parameter in `config.toml` if tasks take longer than expected.

## Support

- Telegram: @五万 Wu Wan
- Issues: Log errors to `logs/error_log.log`

---

*Last Updated: 2026-03-27*
