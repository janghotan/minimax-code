import { test, expect, beforeEach, vi } from 'vitest';
import {
  getLeanAgentSettings,
  updateLeanAgentSettings,
  resetLeanAgentSettings,
} from '@mavis/config';
import { TuiDailyCheckinApplication } from '../packages/tui/src/checkin/application.js';
import { LocalWebsiteDeployTool } from '../packages/agent-tools/src/desktop/local-website-deploy.js';
import { buildDesktopMatrixRuntimeTools } from '../packages/agent-tools/src/desktop/matrix-tools.js';
import { runMcodeTelemetryCommand } from '../packages/tui/src/cli/telemetry-command.js';
import { withByokErrorAttribution } from '../packages/local-runtime-v2/src/service/model-system/resolution/byok-error-attribution.js';

beforeEach(() => {
  resetLeanAgentSettings();
});

test('Lean agent declutter settings have correct Phase 4 defaults', () => {
  const settings = getLeanAgentSettings();
  expect(settings.declutter.disableDailyCheckin).toBe(true);
  expect(settings.declutter.disableCloudWebsiteDeploy).toBe(true);
  expect(settings.declutter.disableMatrixTools).toBe(true);
  expect(settings.declutter.disableTelemetry).toBe(true);
  expect(settings.declutter.disableLoginFlows).toBe(true);
  expect(settings.provider.defaultApiFormat).toBe('openai-completions');
  expect(settings.provider.defaultModel).toBe('deepseek-chat');
});

test('Daily check-in is hard-disabled and makes zero network calls', async () => {
  const mockGateway = {
    getSigninPanel: vi.fn(),
    claimSignin: vi.fn(),
  };

  const checkinApp = new TuiDailyCheckinApplication(mockGateway);
  const outcome = await checkinApp.run();

  expect(outcome.status).toBe('unavailable');
  expect(mockGateway.getSigninPanel).not.toHaveBeenCalled();
  expect(mockGateway.claimSignin).not.toHaveBeenCalled();
});

test('Cloud website deploy is hard-disabled in lean mode', async () => {
  const mockAdapter = {
    deploy: vi.fn(),
  } as any;

  const deployTool = new LocalWebsiteDeployTool(mockAdapter, '/tmp/workspace');
  const result = await deployTool.execute({
    path: '/tmp/workspace/dist',
    source_path: '/tmp/workspace/src',
  });

  expect(result.details.ok).toBe(false);
  const text = result.content[0]?.text ?? '';
  expect(text).toContain('Cloud website deployment is disabled in lean mode');
  expect(mockAdapter.deploy).not.toHaveBeenCalled();
});

test('Matrix cloud MCP host is hard-disabled and returns empty tools list', () => {
  const tools = buildDesktopMatrixRuntimeTools({
    workspaceRoot: '/tmp/workspace',
  });

  expect(tools).toEqual([]);
});

test('Telemetry is hard-disabled: status reports blocked and preview emits zero network request', () => {
  const statusRaw = runMcodeTelemetryCommand('status', '0.7.2');
  const status = JSON.parse(statusRaw);

  expect(status.enabled).toBe(false);
  expect(status.blockedBy).toBe('hard-disabled');
  expect(status.channels.usage.enabled).toBe(false);

  const previewRaw = runMcodeTelemetryCommand('preview', '0.7.2');
  const preview = JSON.parse(previewRaw);
  expect(preview.request).toBeNull();
  expect(preview.message).toContain('Usage telemetry is disabled');
});

test('BYOK unreachable endpoint returns clear actionable failure message', async () => {
  const failingStreamFn = vi.fn(async () => {
    throw new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:9999');
  });

  const wrapped = withByokErrorAttribution({
    streamFn: failingStreamFn as any,
    providerId: 'custom_provider:deepseek',
  });

  await expect(wrapped({ id: 'deepseek-chat' } as any, { messages: [] }, {} as any)).rejects.toThrow(
    /BYOK endpoint is unreachable\. Please verify --base-url and network connectivity/,
  );
});
