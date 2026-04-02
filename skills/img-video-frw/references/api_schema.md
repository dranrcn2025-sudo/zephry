# FRW API Schema Reference

## Overview

This document describes the API endpoints and data structures supported by Img-Video-FRW.

## Supported Endpoints

### 1. Image Task Submission

| Field | Type | Required | Description |
|-------|-----|----------|-------------|
| `task_id` | string | Yes | Task identifier (e.g., `img_task60001`) |
| `positive_prompt` | string | Yes | Image generation prompt |
| `img_url` | string | Yes | Input image URL for img2img |
| `img_model` | string | No | Model name (default: `qwen`) |
| `cfg_scale` | number | No | CFG scale (default: 3.5) |
| `sampling_steps` | number | No | Sampling steps (default: 30) |
| `sampler_method` | string | No | Sampler method (default: `simple`) |
| `width` | number | No | Image width (default: 1376) |
| `height` | number | No | Image height (default: 768) |

**Endpoint**: `POST /img2img_scene_2`

### 2. Video Task Submission

| Field | Type | Required | Description |
|-------|-----|----------|-------------|
| `task_id` | string | Yes | Task identifier (e.g., `vid_task60001`) |
| `positive_prompt` | string | Yes | Video generation prompt |
| `vid_url` | string | Yes | Input video URL for video inpainting |
| `vid_model` | string | No | Model name (default: `qwen-v4`) |
| `width` | number | No | Video width (default: 576) |
| `height` | number | No | Video height (default: 576) |
| `fps` | number | No | Frame rate (default: 24) |
| `length` | number | No | Video length in seconds (default: 3) |

**Endpoint**: `POST /vid2vid_scene_2`

### 3. Task Status Query

| Field | Type | Required | Description |
|-------|-----|----------|-------------|
| `task_id` | string | Yes | Task identifier |

**Endpoint**: `GET /get_task?task_id=xxx`

## Response Format

### Task Submission Response

```json
{
  "success": true,
  "message": "success",
  "code": 200,
  "data": {
    "task_id": "img_task60001",
    "status": 0,
    "progress": 0.0,
    "estimated_time": 60
  }
}
```

### Task Status Response

```json
{
  "success": true,
  "message": "success",
  "code": 200,
  "data": {
    "task_id": "img_task60001",
    "status": 2,
    "out_data": "https://frw2.aiaiartist.com/generated/img_task60001.jpg"
  }
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `0` | Pending |
| `1` | Processing |
| `2` | Completed |
| `-1` | Failed |
| `4` | Timeout |

## Error Handling

### 404 - Not Found
```json
{
  "code": 404,
  "message": "Task not found"
}
```

### 500 - Server Error
```json
{
  "code": 500,
  "message": "Internal server error"
}
```

### Authentication Error
```json
{
  "code": 401,
  "message": "Invalid API KEY"
}
```

---

*Last Updated: 2026-03-27*
