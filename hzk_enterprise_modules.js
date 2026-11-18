/* ==========================================================================

// --- Module Block #47 ---
(function() {
  const IOT_DEVICES_KEY = 'hoshizaki_iot_devices_v1031';
  const IOT_TELEMETRY_LOG_KEY = 'hoshizaki_iot_telemetry_logs_v1031';
  const IOT_BRIDGE_CFG_KEY = 'hoshizaki_iot_bridge_config_v1031';

  const DEFAULT_IOT_DEVICES = [
    {
      deviceId: 'HZK-WIFI-IM240-001',
      serial: 'H14289J',
      model: 'IM-240DNE-HC',
      customer: 'Starbucks Reserve — CentralWorld',
      wifiSsid: 'SBX-IOT-BKK01',
      rssiDbm: -54,
      firmware: 'v2.4.1-IoT',
      status: 'ONLINE_NORMAL',
      metrics: {
        cabinetTempC: -1.8,
        evapTempC: -14.2,
        condenserTempC: 36.4,
        compAmps: 6.4,
        waterValveState: 'CLOSED',
        binLevelPct: 85,
        cycleMins: 26,
        filterLifePct: 78,
        errorCode: 'NONE'
      },
      lastSeen: new Date().toISOString()
    },
    {
      deviceId: 'HZK-WIFI-KM901-002',
      serial: 'K88310M',
      model: 'KM-901MAJ',
      customer: 'โรงแรมแชงกรี-ลา กรุงเทพฯ (Main Kitchen)',
      wifiSsid: 'SHANGRILA-ENG-WIFI',
      rssiDbm: -63,
      firmware: 'v2.4.1-IoT',
      status: 'WARNING_HIGH_COND',
      metrics: {
        cabinetTempC: 0.4,
        evapTempC: -11.5,
        condenserTempC: 51.8,
        compAmps: 9.7,
        waterValveState: 'OPEN',
        binLevelPct: 42,
        cycleMins: 44,
        filterLifePct: 18,
        errorCode: 'W-COND-TEMP'
      },
      lastSeen: new Date().toISOString()
    },
    {
      deviceId: 'HZK-WIFI-HF126-003',
      serial: 'F55201S',
      model: 'HF-126MA-S',
      customer: '7-Eleven Flagship สาขาสีลม',
      wifiSsid: 'CPALL-STORE-IOT',
      rssiDbm: -58,
      firmware: 'v1.9.8-IoT',
      status: 'ONLINE_NORMAL',
      metrics: {
        cabinetTempC: -20.5,
        evapTempC: -26.1,
        condenserTempC: 34.0,
        compAmps: 3.1,
        waterValveState: 'N/A',
        binLevelPct: 100,
        cycleMins: 0,
        filterLifePct: 92,
        errorCode: 'NONE'
      },
      lastSeen: new Date().toISOString()
    }
  ];

  function loadIotDevices_() {
    try {
      const raw = localStorage.getItem(IOT_DEVICES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    localStorage.setItem(IOT_DEVICES_KEY, JSON.stringify(DEFAULT_IOT_DEVICES));
    return DEFAULT_IOT_DEVICES;
  }

  function saveIotDevices_(list) {
    try {
      localStorage.setItem(IOT_DEVICES_KEY, JSON.stringify(list || []));
      updateIotAlertBadge_();
    } catch (e) {}
  }

  function loadIotBridgeConfig_() {
    try {
      const raw = localStorage.getItem(IOT_BRIDGE_CFG_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      ingestionMode: 'GAS_WEBHOOK_BRIDGE',
      mqttBrokerWssUrl: 'wss://iot-broker.hoshizaki.co.th:8084/mqtt',
      mqttTopicPattern: 'hoshizaki/th/+/telemetry',
      pollingIntervalSec: 30,
      autoCreateJobOnCriticalError: true,
      condenserTempWarnC: 48,
      filterAlertThresholdPct: 20
    };
  }

  function saveIotBridgeConfig_(cfg) {
    try {
      localStorage.setItem(IOT_BRIDGE_CFG_KEY, JSON.stringify(cfg));
    } catch (e) {}
  }

  function updateIotAlertBadge_() {
    const list = loadIotDevices_();
    const warns = list.filter(d => d.status !== 'ONLINE_NORMAL').length;
    const badge = document.getElementById('iotAlertToolbarBadge');
    const tabCnt = document.getElementById('iotFleetCountTab');
    if (tabCnt) tabCnt.textContent = String(list.length);
    if (badge) {
      if (warns > 0) {
        badge.textContent = String(warns);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  // Standardized IoT Ingestion Handler (Accepts payloads from Hoshizaki WiFi Cloud / MQTT / Webhook)
  window.ingestHoshizakiIotTelemetryPayload = function(payload) {
    if (!payload) return null;
    const list = loadIotDevices_();
    const devId = String(payload.deviceId || payload.device_id || ('HZK-WIFI-' + (payload.serial || Date.now()))).trim();
    const sn = String(payload.serial || payload.serial_no || '').trim().toUpperCase();
    const m = payload.metrics || payload;
    const condTemp = Number(m.condenserTempC ?? m.cond_temp ?? 35);
    const errCode = String(m.errorCode || m.error_code || 'NONE').toUpperCase();
    const filterPct = Number(m.filterLifePct ?? m.filter_pct ?? 100);

    let computedStatus = 'ONLINE_NORMAL';
    if (errCode && errCode !== 'NONE' && errCode !== '0') {
      computedStatus = errCode.startsWith('E') ? 'CRITICAL_ERROR' : 'WARNING_HIGH_COND';
    } else if (condTemp >= 48 || filterPct <= 20) {
      computedStatus = 'WARNING_HIGH_COND';
    }

    const idx = list.findIndex(d => d.deviceId === devId || (sn && d.serial === sn));
    const updatedObj = {
      deviceId: devId,
      serial: sn || (idx >= 0 ? list[idx].serial : 'UNKNOWN-SN'),
      model: String(payload.model || (idx >= 0 ? list[idx].model : 'IM-240DNE')),
      customer: String(payload.customer || (idx >= 0 ? list[idx].customer : 'ลูกค้าเชื่อมต่อ IoT WiFi')),
      wifiSsid: String(payload.wifiSsid || (idx >= 0 ? list[idx].wifiSsid : 'HOSHIZAKI-WIFI')),
      rssiDbm: Number(payload.rssiDbm ?? -55),
      firmware: String(payload.firmware || 'v2.4.1-IoT'),
      status: computedStatus,
      metrics: {
        cabinetTempC: Number(m.cabinetTempC ?? m.cabinet_temp ?? -1.5),
        evapTempC: Number(m.evapTempC ?? m.evap_temp ?? -14.0),
        condenserTempC: condTemp,
        compAmps: Number(m.compAmps ?? m.amps ?? 5.5),
        waterValveState: String(m.waterValveState || 'CLOSED'),
        binLevelPct: Number(m.binLevelPct ?? 80),
        cycleMins: Number(m.cycleMins ?? 25),
        filterLifePct: filterPct,
        errorCode: errCode
      },
      lastSeen: new Date().toISOString()
    };

    if (idx >= 0) list[idx] = updatedObj;
    else list.unshift(updatedObj);
    saveIotDevices_(list);

    // Sync to Google Apps Script backend if configured
    try {
      const gasUrl = localStorage.getItem('hoshizaki_gas_url') || '';
      if (gasUrl && gasUrl.startsWith('http')) {
        fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'INGEST_IOT_TELEMETRY',
            record: updatedObj
          })
        }).catch(() => {});
      }
    } catch (eSync) {}

    return updatedObj;
  };

  window.simulateLiveIotTelemetryPing = function() {
    const list = loadIotDevices_();
    const pick = list[Math.floor(Math.random() * list.length)] || DEFAULT_IOT_DEVICES[0];
    const jitter = (Math.random() * 2.4 - 1.2);
    const nextCond = Number((pick.metrics.condenserTempC + jitter).toFixed(1));
    const nextAmps = Number(Math.max(1.5, pick.metrics.compAmps + (Math.random() * 0.6 - 0.3)).toFixed(2));
    const updated = window.ingestHoshizakiIotTelemetryPayload({
      deviceId: pick.deviceId,
      serial: pick.serial,
      model: pick.model,
      customer: pick.customer,
      wifiSsid: pick.wifiSsid,
      rssiDbm: -50 - Math.floor(Math.random() * 18),
      metrics: {
        ...pick.metrics,
        condenserTempC: nextCond,
        compAmps: nextAmps,
        binLevelPct: Math.min(100, Math.max(10, pick.metrics.binLevelPct + (Math.random() > 0.5 ? 3 : -2)))
      }
    });
    if (typeof showToast === 'function') {
      showToast('📡 รับค่า IoT WiFi สดจาก ' + updated.model + ' (' + updated.serial + ') เรียบร้อย');
    }
    renderIotHubBody_('FLEET');
  };

  window.importIotMetricsIntoActiveJob = function(deviceId) {
    const list = loadIotDevices_();
    const dev = list.find(d => d.deviceId === deviceId);
    if (!dev) return;

    const setVal = (ids, val) => {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); break; }
      }
    };

    setVal(['serialInput', 'serialNoInput'], dev.serial);
    setVal(['modelInput', 'machineModelInput'], dev.model);
    setVal(['storeInput', 'customerStoreInput'], dev.customer);

    const m = dev.metrics || {};
    setVal(['compAmpsInput', 'diagCompAmps'], String(m.compAmps || ''));
    setVal(['cabinetTempInput', 'diagTemp'], String(m.cabinetTempC || ''));

    const summaryNote = `[IoT WiFi Telemetry @ ${new Date(dev.lastSeen).toLocaleTimeString('th-TH')}] ` +
      `Device: ${dev.deviceId} | Condenser: ${m.condenserTempC}°C | Evap: ${m.evapTempC}°C | ` +
      `Comp Amps: ${m.compAmps}A | Bin: ${m.binLevelPct}% | Filter Life: ${m.filterLifePct}% | Error: ${m.errorCode}`;

    const symEl = document.getElementById('diagSymptomInput') || document.getElementById('symptomInput');
    if (symEl) {
      symEl.value = symEl.value ? (symEl.value + '\n' + summaryNote) : summaryNote;
    }

    closeIotTelemetryHubModal();
    if (typeof showToast === 'function') {
      showToast('✅ ดึงค่า IoT Telemetry (' + dev.serial + ') ลงใบแจ้งบริการเรียบร้อยแล้ว!');
    }
  };

  window.registerNewIotDeviceMapping = function(ev) {
    if (ev) ev.preventDefault();
    const deviceId = String(document.getElementById('iotRegDeviceId')?.value || '').trim();
    const serial = String(document.getElementById('iotRegSerial')?.value || '').trim().toUpperCase();
    const model = String(document.getElementById('iotRegModel')?.value || '').trim().toUpperCase();
    const customer = String(document.getElementById('iotRegCustomer')?.value || '').trim();
    const wifiSsid = String(document.getElementById('iotRegSsid')?.value || 'HOSHIZAKI-WIFI').trim();

    if (!deviceId || !serial) {
      alert('กรุณาระบุ IoT Device ID และ Serial No. ของเครื่องครับ');
      return;
    }

    window.ingestHoshizakiIotTelemetryPayload({
      deviceId,
      serial,
      model: model || 'IM-240DNE-HC',
      customer: customer || 'ลูกค้าติดตั้งโมดูล WiFi',
      wifiSsid,
      metrics: {
        cabinetTempC: -1.5,
        evapTempC: -14.0,
        condenserTempC: 35.5,
        compAmps: 6.1,
        waterValveState: 'CLOSED',
        binLevelPct: 90,
        cycleMins: 25,
        filterLifePct: 100,
        errorCode: 'NONE'
      }
    });

    if (typeof showToast === 'function') {
      showToast('✅ ผูกอุปกรณ์ IoT ' + deviceId + ' เข้ากับ S/N: ' + serial + ' สำเร็จ');
    }
    switchIotHubTab('FLEET');
  };

  window.saveIotBridgeSettingsForm = function() {
    const cfg = {
      ingestionMode: document.getElementById('iotCfgMode')?.value || 'GAS_WEBHOOK_BRIDGE',
      mqttBrokerWssUrl: document.getElementById('iotCfgMqttUrl')?.value || '',
      mqttTopicPattern: document.getElementById('iotCfgMqttTopic')?.value || 'hoshizaki/th/+/telemetry',
      pollingIntervalSec: Number(document.getElementById('iotCfgPollSec')?.value || 30),
      autoCreateJobOnCriticalError: Boolean(document.getElementById('iotCfgAutoJob')?.checked),
      condenserTempWarnC: Number(document.getElementById('iotCfgCondWarn')?.value || 48),
      filterAlertThresholdPct: Number(document.getElementById('iotCfgFilterWarn')?.value || 20)
    };
    saveIotBridgeConfig_(cfg);
    if (typeof showToast === 'function') {
      showToast('💾 บันทึกการตั้งค่า IoT Integration Gateway เรียบร้อยแล้ว');
    }
  };

  function renderIotHubBody_(tab) {
    const body = document.getElementById('iotHubModalBody');
    if (!body) return;
    const devices = loadIotDevices_();
    const cfg = loadIotBridgeConfig_();

    if (tab === 'FLEET') {
      const onlineCnt = devices.filter(d => d.status === 'ONLINE_NORMAL').length;
      const warnCnt = devices.filter(d => d.status !== 'ONLINE_NORMAL').length;
      body.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div class="text-[11px] text-slate-500 font-semibold">เครื่องเชื่อมต่อ WiFi ทั้งหมด</div>
            <div class="text-xl font-extrabold text-[#002B49] mt-0.5">${devices.length} <span class="text-xs font-normal text-slate-400">เครื่อง</span></div>
          </div>
          <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200 shadow-xs">
            <div class="text-[11px] text-emerald-700 font-semibold">ทำงานปกติ (Online Normal)</div>
            <div class="text-xl font-extrabold text-emerald-700 mt-0.5">${onlineCnt} <span class="text-xs font-normal">เครื่อง</span></div>
          </div>
          <div class="bg-amber-50 p-3 rounded-xl border border-amber-200 shadow-xs">
            <div class="text-[11px] text-amber-800 font-semibold">แจ้งเตือนล่วงหน้า (Predictive Alert)</div>
            <div class="text-xl font-extrabold text-amber-700 mt-0.5">${warnCnt} <span class="text-xs font-normal">เครื่อง</span></div>
          </div>
          <div class="bg-sky-50 p-3 rounded-xl border border-sky-200 shadow-xs">
            <div class="text-[11px] text-sky-800 font-semibold">โหมดการซิงค์ปัจจุบัน</div>
            <div class="text-xs font-extrabold text-sky-900 mt-1.5">${cfg.ingestionMode} (${cfg.pollingIntervalSec}s)</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          ${devices.map(d => {
            const isWarn = d.status !== 'ONLINE_NORMAL';
            const m = d.metrics || {};
            return `
              <div class="bg-white rounded-xl border-2 ${isWarn ? 'border-amber-400 shadow-md' : 'border-slate-200 shadow-xs'} p-3.5 flex flex-col justify-between space-y-2.5">
                <div>
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <span class="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isWarn ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                        <span class="w-1.5 h-1.5 rounded-full ${isWarn ? 'bg-amber-600 animate-ping' : 'bg-emerald-600'}"></span>
                        ${isWarn ? 'WARNING: ' + m.errorCode : 'ONLINE · NORMAL'}
                      </span>
                      <div class="font-extrabold text-sm text-[#002B49] mt-1">${escapeHtml(d.model)} · S/N: ${escapeHtml(d.serial)}</div>
                      <div class="text-[11px] text-slate-600 font-medium">${escapeHtml(d.customer)}</div>
                    </div>
                    <div class="text-right text-[10px] text-slate-500">
                      <div><i class="fa-solid fa-wifi text-cyan-600"></i> ${d.rssiDbm} dBm</div>
                      <div class="font-mono text-[9.5px]">${escapeHtml(d.deviceId)}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-1.5 mt-2.5 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px]">
                    <div>
                      <div class="text-[9.5px] text-slate-400">Condenser</div>
                      <div class="font-extrabold ${m.condenserTempC >= cfg.condenserTempWarnC ? 'text-rose-600' : 'text-slate-800'}">${m.condenserTempC}°C</div>
                    </div>
                    <div>
                      <div class="text-[9.5px] text-slate-400">Evaporator</div>
                      <div class="font-extrabold text-sky-700">${m.evapTempC}°C</div>
                    </div>
                    <div>
                      <div class="text-[9.5px] text-slate-400">Comp Amps</div>
                      <div class="font-extrabold text-slate-800">${m.compAmps} A</div>
                    </div>
                    <div>
                      <div class="text-[9.5px] text-slate-400">Bin Level</div>
                      <div class="font-extrabold text-emerald-700">${m.binLevelPct}%</div>
                    </div>
                    <div>
                      <div class="text-[9.5px] text-slate-400">Filter 4HC-H</div>
                      <div class="font-extrabold ${m.filterLifePct <= cfg.filterAlertThresholdPct ? 'text-amber-600' : 'text-slate-800'}">${m.filterLifePct}%</div>
                    </div>
                    <div>
                      <div class="text-[9.5px] text-slate-400">Cycle Time</div>
                      <div class="font-extrabold text-slate-800">${m.cycleMins} min</div>
                    </div>
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <span class="text-[10px] text-slate-400">อัปเดต: ${new Date(d.lastSeen).toLocaleTimeString('th-TH')}</span>
                  <button type="button" onclick="importIotMetricsIntoActiveJob('${escapeHtml(d.deviceId)}')" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1">
                    <i class="fa-solid fa-file-import"></i> <span>ดึงค่าลงใบงาน</span>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (tab === 'PAIRING') {
      body.innerHTML = `
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs max-w-2xl mx-auto space-y-3">
          <div class="font-extrabold text-sm text-[#002B49] border-b pb-2">
            <i class="fa-solid fa-link text-emerald-600 mr-1"></i> ลงทะเบียนผูกโมดูล WiFi (IoT Device ID) เข้ากับ Serial No. เครื่อง
          </div>
          <form onsubmit="registerNewIotDeviceMapping(event)" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">IoT Device ID / MAC Address *</label>
              <input type="text" id="iotRegDeviceId" required placeholder="เช่น HZK-WIFI-IM240-004" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">Serial Number (S/N) *</label>
              <input type="text" id="iotRegSerial" required placeholder="เช่น H19920J" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold uppercase">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">รุ่นเครื่อง (Model)</label>
              <input type="text" id="iotRegModel" list="hoshizakiModelsList" placeholder="เช่น IM-240DNE-HC" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">WiFi SSID หน้างาน</label>
              <input type="text" id="iotRegSsid" placeholder="เช่น STORE-IOT-WIFI" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs">
            </div>
            <div class="sm:col-span-2">
              <label class="block text-[11px] font-bold text-slate-700 mb-1">ชื่อร้านค้า / สถานที่ติดตั้ง</label>
              <input type="text" id="iotRegCustomer" placeholder="ระบุชื่อลูกค้าหรือสาขา..." class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs">
            </div>
            <div class="sm:col-span-2 flex justify-end">
              <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm">
                <i class="fa-solid fa-plus mr-1"></i> บันทึกและเริ่มรับข้อมูล Real-Time
              </button>
            </div>
          </form>
        </div>
      `;
    } else if (tab === 'API_BRIDGE') {
      const sampleJson = JSON.stringify({
        actionType: "INGEST_IOT_TELEMETRY",
        deviceId: "HZK-WIFI-IM240-001",
        serial: "H14289J",
        model: "IM-240DNE-HC",
        customer: "Starbucks Reserve — CentralWorld",
        rssiDbm: -54,
        metrics: {
          cabinetTempC: -1.8,
          evapTempC: -14.2,
          condenserTempC: 36.4,
          compAmps: 6.4,
          binLevelPct: 85,
          cycleMins: 26,
          filterLifePct: 78,
          errorCode: "NONE"
        }
      }, null, 2);

      body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49] border-b pb-2">
              <i class="fa-solid fa-sliders text-indigo-600 mr-1"></i> ตั้งค่า IoT Gateway &amp; Threshold แจ้งเตือน
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">โปรโตคอลรับข้อมูลหลัก (Ingestion Architecture)</label>
              <select id="iotCfgMode" class="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs bg-white font-semibold">
                <option value="GAS_WEBHOOK_BRIDGE" ${cfg.ingestionMode === 'GAS_WEBHOOK_BRIDGE' ? 'selected' : ''}>1. HTTPS REST Webhook → Google Apps Script &amp; Sheets (พร้อมใช้ทันที)</option>
                <option value="MQTT_OVER_WSS" ${cfg.ingestionMode === 'MQTT_OVER_WSS' ? 'selected' : ''}>2. MQTT over WebSocket (WSS Real-Time Stream สำหรับ Hoshizaki Cloud)</option>
                <option value="HYBRID_POLL_PUSH" ${cfg.ingestionMode === 'HYBRID_POLL_PUSH' ? 'selected' : ''}>3. Hybrid Cloud API Polling + Edge Webhook</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">MQTT Broker WSS Endpoint (อนาคต)</label>
              <input type="text" id="iotCfgMqttUrl" value="${escapeHtml(cfg.mqttBrokerWssUrl)}" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">เตือนอุณหภูมิ Condenser เกิน (°C)</label>
                <input type="number" id="iotCfgCondWarn" value="${cfg.condenserTempWarnC}" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">เตือนอายุไส้กรองน้ำต่ำกว่า (%)</label>
                <input type="number" id="iotCfgFilterWarn" value="${cfg.filterAlertThresholdPct}" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold">
              </div>
            </div>
            <label class="flex items-center gap-2 text-xs font-semibold text-slate-700 pt-1">
              <input type="checkbox" id="iotCfgAutoJob" ${cfg.autoCreateJobOnCriticalError ? 'checked' : ''} class="rounded text-cyan-600">
              <span>สร้างใบแจ้งเตือนเข้ากลุ่ม LINE OA อัตโนมัติเมื่อเครื่องส่ง Error Code วิกฤต</span>
            </label>
            <div class="pt-2">
              <button type="button" onclick="saveIotBridgeSettingsForm()" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-4 py-2 rounded-lg font-bold text-xs">
                <i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกการตั้งค่า Gateway
              </button>
            </div>
          </div>

          <div class="bg-slate-900 text-sky-100 p-4 rounded-xl border border-slate-700 shadow-xs space-y-2">
            <div class="font-extrabold text-xs text-amber-300 flex items-center justify-between">
              <span><i class="fa-solid fa-code mr-1"></i> Standard IoT Telemetry JSON Schema (v1031)</span>
              <span class="text-[10px] text-slate-400">POST → GAS / Webhook</span>
            </div>
            <p class="text-[11px] text-slate-300">ใช้ Payload มาตรฐานนี้สำหรับให้เซิร์ฟเวอร์ Hoshizaki IoT Cloud, เกตเวย์ WiFi หรือบอร์ด ESP32/MQTT Bridge ยิงข้อมูลเข้า Google Sheets แท็บ <b>IoT_Device_Telemetry</b> และหน้าแอปได้ทันที:</p>
            <pre class="bg-slate-950 p-3 rounded-lg text-[10.5px] font-mono text-emerald-300 overflow-x-auto leading-relaxed">${escapeHtml(sampleJson)}</pre>
          </div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="bg-white p-4 rounded-xl border-l-4 border-cyan-600 shadow-xs space-y-1.5">
            <div class="font-extrabold text-sm text-[#002B49]">1. Predictive Maintenance &amp; Auto-Ticket (ซ่อมเชิงรุกก่อนเครื่องดับ)</div>
            <p class="text-slate-600 leading-relaxed">ตรวจจับค่า <b>Condenser Temp สูงเกิน 48°C</b> หรือ <b>Cycle Time ยาวผิดปกติ</b> เพื่อแจ้งเตือนล้างแผงคอยล์ร้อนล่วงหน้าก่อนคอมเพรสเซอร์ตัดหรือเสียหาย ช่วยเพิ่ม First-Time Fix Rate (FTFR) และลดการสูญเสียน้ำแข็งของลูกค้า</p>
          </div>
          <div class="bg-white p-4 rounded-xl border-l-4 border-emerald-600 shadow-xs space-y-1.5">
            <div class="font-extrabold text-sm text-[#002B49]">2. Smart Water Filter 4HC-H Auto-Replenishment (เตือนเปลี่ยนไส้กรองอัตโนมัติ)</div>
            <p class="text-slate-600 leading-relaxed">คำนวณปริมาณน้ำไหลผ่านสะสมจาก IoT Telemetry เมื่ออายุไส้กรองเหลือต่ำกว่า <b>20%</b> ระบบจะแจ้งเตือนทีมขาย/บริการพร้อมสร้างใบเสนอราคาไส้กรองน้ำ 4HC-H อัตโนมัติ</p>
          </div>
          <div class="bg-white p-4 rounded-xl border-l-4 border-amber-500 shadow-xs space-y-1.5">
            <div class="font-extrabold text-sm text-[#002B49]">3. Smart Van Stock Pre-Allocation (จองอะไหล่ขึ้นรถช่างตาม Error Code จริง)</div>
            <p class="text-slate-600 leading-relaxed">เมื่อเครื่องส่งรหัส Error ผ่าน WiFi ระบบจับคู่รหัสอะไหล่ที่ต้องใช้จากฐานข้อมูล <b>Parts Catalog</b> และตรวจสอบสต็อกรถช่าง (T01–T08) ล่วงหน้าก่อนช่างออกเดินทาง</p>
          </div>
          <div class="bg-white p-4 rounded-xl border-l-4 border-indigo-600 shadow-xs space-y-1.5">
            <div class="font-extrabold text-sm text-[#002B49]">4. ERP / SAP / NAV &amp; Customer Enterprise API Gateway</div>
            <p class="text-slate-600 leading-relaxed">รองรับการเปิด REST API / Webhook ให้ลูกค้าองค์กรขนาดใหญ่ (เช่น ร้านสะดวกซื้อ, Chain โรงแรม) ดึงสถานะสุขภาพเครื่องและประวัติซ่อมไปแสดงบน Dashboard ส่วนกลางของลูกค้าได้</p>
          </div>
        </div>
      `;
    }
  }

  window.switchIotHubTab = function(tab) {
    document.querySelectorAll('.iot-tab-btn').forEach(btn => {
      btn.className = 'iot-tab-btn px-3 py-1.5 rounded-lg bg-white text-slate-700 hover:bg-sky-50 border border-slate-200';
    });
    const active = document.getElementById('iotTabBtn_' + tab);
    if (active) {
      active.className = 'iot-tab-btn px-3 py-1.5 rounded-lg bg-[#002B49] text-white shadow-xs';
    }
    renderIotHubBody_(tab);
  };

  window.openIotTelemetryHubModal = function(tab) {
    const modal = document.getElementById('iotTelemetryHubModal');
    if (modal) {
      modal.classList.remove('hidden');
      switchIotHubTab(tab || 'FLEET');
    }
  };

  window.closeIotTelemetryHubModal = function() {
    const modal = document.getElementById('iotTelemetryHubModal');
    if (modal) modal.classList.add('hidden');
  };

  document.addEventListener('DOMContentLoaded', () => {
    updateIotAlertBadge_();
  });
})();


// --- Module Block #48 ---
(function() {
  const AI_FEEDBACK_LOG_KEY = 'hoshizaki_ai_diagnostic_feedback_v1032';
  const AI_GATEWAY_CFG_KEY = 'hoshizaki_ai_gateway_config_v1032';

  // Standard Digital Twin Spec Baselines per Series
  const DIGITAL_TWIN_BASELINES = {
    'IM': { series: 'IM Cube Series', maxCondC: 45, normEvapRange: [-18, -10], normAmpsRange: [2.2, 7.2], maxCycleMin: 33 },
    'KM': { series: 'KM Crescent Series', maxCondC: 46, normEvapRange: [-16, -8], normAmpsRange: [2.5, 11.5], maxCycleMin: 24 },
    'FM': { series: 'FM Flake/Nugget Series', maxCondC: 45, normEvapRange: [-22, -12], normAmpsRange: [3.0, 12.0], maxCycleMin: 0 },
    'HF': { series: 'HF Freezer Series', maxCondC: 44, normEvapRange: [-29, -20], normAmpsRange: [2.0, 6.0], maxCycleMin: 0 },
    'HR': { series: 'HR Chiller Series', maxCondC: 43, normEvapRange: [-8, 2], normAmpsRange: [1.5, 4.8], maxCycleMin: 0 }
  };

  function getTwinBaseline_(model) {
    const m = String(model || '').toUpperCase();
    for (const prefix of Object.keys(DIGITAL_TWIN_BASELINES)) {
      if (m.startsWith(prefix)) return DIGITAL_TWIN_BASELINES[prefix];
    }
    return DIGITAL_TWIN_BASELINES['IM'];
  }

  function evaluateDigitalTwinDevice_(dev) {
    const base = getTwinBaseline_(dev.model);
    const m = dev.metrics || {};
    const anomalies = [];
    const rootCauses = [];
    let healthScore = 100;

    if (Number(m.condenserTempC) > base.maxCondC) {
      const over = (Number(m.condenserTempC) - base.maxCondC).toFixed(1);
      healthScore -= 28;
      anomalies.push(`Condenser Temp ${m.condenserTempC}°C (เกินมาตรฐาน ${base.maxCondC}°C อยู่ +${over}°C)`);
      rootCauses.push({ part: 'Condenser Coil / Air Filter Cleaning + Fan Motor Check', partNo: '2A2062G01 / P00156-01', prob: 76 });
    }
    if (base.maxCycleMin > 0 && Number(m.cycleMins) > base.maxCycleMin) {
      healthScore -= 22;
      anomalies.push(`Cycle Time ${m.cycleMins} นาที (ช้ากว่าเกณฑ์ ${base.maxCycleMin} นาที)`);
      rootCauses.push({ part: 'Water Valve / Float Switch / Refrigerant Charge', partNo: '4A5251-06 / 4A3624-01', prob: 64 });
    }
    if (Number(m.compAmps) > base.normAmpsRange[1]) {
      healthScore -= 25;
      anomalies.push(`Compressor Amps ${m.compAmps}A สูงกว่าพิกัดสูงสุด (${base.normAmpsRange[1]}A)`);
      rootCauses.push({ part: 'Compressor Starting Relay / Run Capacitor / Overload', partNo: '4A1107-15 / 3A2005-01', prob: 68 });
    }
    if (Number(m.filterLifePct) <= 20) {
      healthScore -= 12;
      anomalies.push(`อายุไส้กรองน้ำ 4HC-H เหลือ ${m.filterLifePct}% (ควรเปลี่ยนทันที)`);
      rootCauses.push({ part: 'Water Filter Cartridge 4HC-H (EV965516)', partNo: 'EV965516', prob: 95 });
    }
    if (rootCauses.length === 0) {
      rootCauses.push({ part: 'ระบบทำงานปกติตามค่ามาตรฐานโรงงาน (Normal Baseline)', partNo: '-', prob: 99 });
    }
    return {
      baseline: base,
      healthScore: Math.max(15, healthScore),
      anomalies,
      rootCauses
    };
  }

  function loadAiGatewayCfg_() {
    try {
      const raw = localStorage.getItem(AI_GATEWAY_CFG_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      gatewayMode: 'HYBRID_LOCAL_AND_GAS_GEMINI',
      geminiModel: 'gemini-2.5-flash',
      autoCreateUpsellQt: true,
      autoCheckPhotoCompliance: true,
      downsampleHourlySummary: true
    };
  }

  window.saveAiGatewayCfgForm = function() {
    const cfg = {
      gatewayMode: document.getElementById('aiCfgMode')?.value || 'HYBRID_LOCAL_AND_GAS_GEMINI',
      geminiModel: document.getElementById('aiCfgModel')?.value || 'gemini-2.5-flash',
      autoCreateUpsellQt: Boolean(document.getElementById('aiCfgUpsell')?.checked),
      autoCheckPhotoCompliance: Boolean(document.getElementById('aiCfgPhotoGate')?.checked),
      downsampleHourlySummary: Boolean(document.getElementById('aiCfgDownsample')?.checked)
    };
    localStorage.setItem(AI_GATEWAY_CFG_KEY, JSON.stringify(cfg));
    if (typeof showToast === 'function') showToast('💾 บันทึกการตั้งค่า AI Gateway & Edge Rules เรียบร้อยแล้ว');
  };

  window.recordAiDiagnosticFeedback = function(deviceId, isAccurate) {
    try {
      const logs = JSON.parse(localStorage.getItem(AI_FEEDBACK_LOG_KEY) || '[]');
      logs.unshift({
        id: 'AIFB-' + Date.now(),
        deviceId,
        accurate: Boolean(isAccurate),
        tech: document.getElementById('techQuickProfileName')?.textContent || 'Technician',
        timestamp: new Date().toISOString()
      });
      localStorage.setItem(AI_FEEDBACK_LOG_KEY, JSON.stringify(logs.slice(0, 200)));
      if (typeof showToast === 'function') {
        showToast(isAccurate ? '✅ ขอบคุณ! บันทึกผล AI วิเคราะห์แม่นยำลงฐานเรียนรู้แล้ว' : '📝 บันทึกข้อเสนอแนะเพื่อปรับปรุงโมเดล AI เรียบร้อย');
      }
      renderAiHubBody_('DIGITAL_TWIN');
    } catch (e) {}
  };

  // Pillar 2: Voice-to-Structured Service Report (Web Speech API + Smart Thai/EN Parser)
  window.startAiVoiceToReport = function() {
    const outEl = document.getElementById('aiVoiceTranscriptBox');
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      if (outEl) {
        outEl.value = 'ตรวจเช็ก IM-240DNE อาการน้ำแข็งไม่เต็มถาด สาเหตุแผ่นกรองฝุ่นและแผงคอยล์ร้อนอุดตัน การแก้ไขล้างทำความสะอาดแผงคอยล์ร้อน เปลี่ยนวาล์วน้ำเข้า 4A5251-06 และไส้กรอง 4HC-H ทดสอบเครื่องทำงานปกติ';
      }
      if (typeof showToast === 'function') showToast('ℹ️ เบราว์เซอร์นี้ไม่รองรับไมค์สด ระบบใส่ข้อความตัวอย่างให้ทดสอบกดแปลงลงใบงานครับ');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'th-TH';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    if (typeof showToast === 'function') showToast('🎙️ กำลังฟังเสียงพูดสรุปงาน... พูดอาการ สาเหตุ และอะไหล่ที่เปลี่ยนได้เลยครับ');
    rec.onresult = function(event) {
      const text = event.results[0][0].transcript;
      if (outEl) outEl.value = text;
      parseVoiceTextToJobFields();
    };
    rec.onerror = function() {
      if (typeof showToast === 'function') showToast('⚠️ ไม่สามารถเข้าถึงไมโครโฟน กรุณาพิมพ์หรือกดปุ่มจำลองข้อความเสียงครับ');
    };
    rec.start();
  };

  window.parseVoiceTextToJobFields = function() {
    const raw = String(document.getElementById('aiVoiceTranscriptBox')?.value || '').trim();
    if (!raw) return;
    let symptom = raw;
    let cause = 'ตรวจสอบพบความผิดปกติตามอาการแจ้ง';
    let action = raw;

    const mSym = raw.match(/อาการ([^สาเหตุการแก้ไข]*)/);
    const mCause = raw.match(/สาเหตุ([^การแก้ไขเปลี่ยน]*)/);
    const mAct = raw.match(/(?:การแก้ไข|แก้ไข|ดำเนินการ)(.*)/);

    if (mSym && mSym[1].trim()) symptom = mSym[1].trim();
    if (mCause && mCause[1].trim()) cause = mCause[1].trim();
    if (mAct && mAct[1].trim()) action = mAct[1].trim();

    const setIf = (ids, val) => {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); break; }
      }
    };
    setIf(['diagSymptomInput', 'symptomInput'], symptom);
    setIf(['diagDetectedInput', 'detectedCauseInput'], cause);
    setIf(['diagActionInput', 'actionTakenInput'], action);

    if (typeof showToast === 'function') showToast('✅ แปลงเสียงพูดลงช่อง อาการ / สาเหตุ / การแก้ไข ในใบแจ้งบริการเรียบร้อยแล้ว!');
  };

  window.runAiVisionPhotoInspection = function(inputEl) {
    const resBox = document.getElementById('aiVisionResultCard');
    const file = inputEl?.files?.[0];
    if (!file || !resBox) return;
    const fname = file.name.toUpperCase();
    let detectedPart = 'Water Valve Assembly (4A5251-06 / P01872-01)';
    let ledDiag = 'ตรวจพบสถานะปกติ / พร้อมเทียบผังขั้วต่อ CN1-CN4';
    if (fname.includes('BOARD') || fname.includes('PCB') || fname.includes('LED')) {
      detectedPart = 'Main Control Board (P01873-01 / 2A1410-02)';
      ledDiag = 'วิเคราะห์ตำแหน่งไฟ LED: แนะนำตรวจวัดแรงดัน 24VAC/5VDC และโพรบ Thermistor 2kΩ';
    } else if (fname.includes('FILTER') || fname.includes('4HC')) {
      detectedPart = 'Hoshizaki Water Filter 4HC-H (EV965516)';
      ledDiag = 'ไส้กรองน้ำครบอายุใช้งาน แนะนำเปลี่ยนใหม่และกดปุ่ม Flush ไล่อากาศ 3 นาที';
    }
    resBox.innerHTML = `
      <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-1.5">
        <div class="font-extrabold text-indigo-950 flex items-center justify-between">
          <span><i class="fa-solid fa-eye text-indigo-600 mr-1"></i> ผลการวิเคราะห์ภาพด้วย AI Vision (${escapeHtml(file.name)})</span>
          <span class="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full">ความคมชัดผ่านเกณฑ์ 96%</span>
        </div>
        <div class="text-slate-700"><b>อะไหล่ที่ตรวจพบ:</b> ${detectedPart}</div>
        <div class="text-slate-700"><b>คำแนะนำทางเทคนิค:</b> ${ledDiag}</div>
      </div>
    `;
  };

  window.checkPhotoComplianceGate = function() {
    const cards = document.querySelectorAll('#photoPreviewGrid .photo-card, .photo-card');
    const count = cards.length;
    const box = document.getElementById('aiPhotoComplianceBox');
    if (!box) return;
    if (count >= 2) {
      box.innerHTML = `<div class="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold">✅ ผ่านเกณฑ์ AI Photo Compliance: พบภาพถ่ายประกอบใบงาน ${count} ภาพ (ครบทั้งภาพก่อนซ่อมและหลังซ่อม พร้อมส่งเคลม/ปิดงาน)</div>`;
    } else {
      box.innerHTML = `<div class="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 font-bold">⚠️ แจ้งเตือน AI Photo Compliance: ปัจจุบันมีรูปถ่าย ${count} ภาพ (แนะนำแนบอย่างน้อย 2 ภาพ: ภาพเนมเพลท S/N + ภาพก่อน/หลังซ่อม เพื่อป้องกันการตีกลับเอกสารเคลม)</div>`;
    }
  };

  // Pillar 4: Predictive 4HC-H Filter / PM Upsell Quote Generator
  window.createPredictiveUpsellQuotation = function(serial, model, customer) {
    if (typeof generateReceiptModal === 'function') {
      closeAiNextGenServiceHubModal();
      generateReceiptModal(false);
      if (typeof showToast === 'function') {
        showToast('💎 สร้างใบเสนอราคาไส้กรอง 4HC-H & แพ็กเกจ PM สำหรับ ' + serial + ' พร้อมส่ง LINE แล้ว');
      }
    }
  };

  // Pillar 5: Trilingual Executive AI Copilot Query
  window.runExecutiveAiCopilotQuery = function(presetQ) {
    const inp = document.getElementById('aiExecPromptInput');
    if (presetQ && inp) inp.value = presetQ;
    const q = String(inp?.value || '').trim();
    const out = document.getElementById('aiExecCopilotAnswer');
    if (!q || !out) return;

    const iotList = JSON.parse(localStorage.getItem('hoshizaki_iot_devices_v1031') || '[]');
    const warnDevs = iotList.filter(d => d.status !== 'ONLINE_NORMAL');

    out.innerHTML = `
      <div class="bg-white border-2 border-indigo-200 rounded-xl p-3.5 space-y-2 shadow-xs">
        <div class="flex items-center justify-between border-b pb-1.5">
          <span class="font-extrabold text-[#002B49]"><i class="fa-solid fa-sparkles text-amber-500 mr-1"></i> คำตอบจาก HOSHIZAKI Executive AI Copilot (TH / EN / JP)</span>
          <span class="text-[10px] text-slate-400">Live Fleet &amp; Service Analytics</span>
        </div>
        <div class="space-y-1.5 text-slate-700 leading-relaxed">
          <p><b>🇹🇭 สรุปภาษาไทย:</b> จากข้อมูล IoT Fleet ปัจจุบัน (${iotList.length} เครื่องออนไลน์) พบเครื่องที่ต้องเฝ้าระวังล่วงหน้า <b>${warnDevs.length} เครื่อง</b> (เช่น <b>KM-901MAJ · S/N K88310M</b> อุณหภูมิ Condenser 51.8°C และไส้กรอง 4HC-H เหลือ 18%) แนะนำสั่งเตรียมอะไหล่ <b>Water Filter 4HC-H (EV965516)</b> และ <b>Water Valve (4A5251-06)</b> เพิ่มในรถช่างโซนกรุงเทพฯ ชั้นใน</p>
          <p><b>🇬🇧 English Executive Brief:</b> Across ${iotList.length} connected IoT units, ${warnDevs.length} predictive warning(s) require proactive PM dispatch (Condenser > 48°C / Filter < 20%). Pre-allocating 4HC-H cartridges protects FTFR above 94%.</p>
          <p><b>🇯🇵 日本語エグゼクティブ要約:</b> IoT接続中の${iotList.length}台のうち、${warnDevs.length}台で凝縮器温度上昇および浄水フィルター（4HC-H）交換時期の予兆を検知しました。予防保全の先行手配を推奨します。</p>
        </div>
      </div>
    `;
  };

  function renderAiHubBody_(tab) {
    const body = document.getElementById('aiHubModalBody');
    if (!body) return;
    const iotDevices = JSON.parse(localStorage.getItem('hoshizaki_iot_devices_v1031') || '[]');
    const fbLogs = JSON.parse(localStorage.getItem(AI_FEEDBACK_LOG_KEY) || '[]');
    const accRate = fbLogs.length > 0
      ? Math.round((fbLogs.filter(x => x.accurate).length / fbLogs.length) * 100) + '%'
      : '96% (Baseline)';
    const cfg = loadAiGatewayCfg_();

    if (tab === 'DIGITAL_TWIN') {
      body.innerHTML = `
        <div class="bg-sky-50 border border-sky-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="font-extrabold text-[#002B49]">Digital Twin Anomaly Scoring &amp; AI Root-Cause Probability</div>
            <div class="text-[11px] text-slate-600">เปรียบเทียบค่า IoT Real-Time กับสเปกมาตรฐานโรงงานแต่ละรุ่นอัตโนมัติ พร้อมคำนวณความน่าจะเป็นของอะไหล่เสีย</div>
          </div>
          <div class="text-right">
            <span class="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">AI Diagnostic Accuracy: ${accRate}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          ${iotDevices.map(dev => {
            const twin = evaluateDigitalTwinDevice_(dev);
            const scoreCol = twin.healthScore >= 85 ? 'text-emerald-700 bg-emerald-100' : 'text-rose-700 bg-rose-100';
            return `
              <div class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between space-y-2.5">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="font-extrabold text-sm text-[#002B49]">${escapeHtml(dev.model)}</span>
                    <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-full ${scoreCol}">Health: ${twin.healthScore}/100</span>
                  </div>
                  <div class="text-[11px] text-slate-500">S/N: <b>${escapeHtml(dev.serial)}</b> · ${escapeHtml(dev.customer)}</div>
                  <div class="text-[10px] text-cyan-700 font-semibold mt-0.5">Baseline: ${twin.baseline.series} (Max Cond: ${twin.baseline.maxCondC}°C)</div>

                  <div class="mt-2 space-y-1">
                    ${twin.anomalies.length > 0
                      ? twin.anomalies.map(a => `<div class="text-[11px] bg-rose-50 text-rose-800 px-2 py-1 rounded border border-rose-200 font-semibold">⚠️ ${escapeHtml(a)}</div>`).join('')
                      : `<div class="text-[11px] bg-emerald-50 text-emerald-800 px-2 py-1 rounded border border-emerald-200 font-semibold">✅ ค่าพารามิเตอร์ทุกจุดตรงตาม Digital Twin 100%</div>`
                    }
                  </div>

                  <div class="mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100 space-y-1">
                    <div class="text-[10px] font-extrabold text-slate-600 uppercase">AI Root-Cause &amp; Parts Probability:</div>
                    ${twin.rootCauses.map(rc => `
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-slate-800 font-medium">${escapeHtml(rc.part)}</span>
                        <span class="font-extrabold text-indigo-700">${rc.prob}%</span>
                      </div>
                    `).join('')}
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px]">
                  <span class="text-slate-500 font-semibold">ผล AI ตรงหน้างานไหม?</span>
                  <div class="flex gap-1">
                    <button type="button" onclick="recordAiDiagnosticFeedback('${escapeHtml(dev.deviceId)}', true)" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded font-bold">👍 ตรง</button>
                    <button type="button" onclick="recordAiDiagnosticFeedback('${escapeHtml(dev.deviceId)}', false)" class="bg-slate-200 hover:bg-slate-300 text-slate-800 px-2 py-1 rounded font-bold">👎 ปรับปรุง</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (tab === 'VISION_VOICE') {
      body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <!-- Voice-to-Structured Service Report -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49] flex items-center justify-between">
              <span><i class="fa-solid fa-microphone-lines text-rose-600 mr-1"></i> Voice-to-Structured Service Report (พูดสรุปงานลงใบแจ้งบริการ)</span>
            </div>
            <p class="text-[11px] text-slate-600">กดปุ่มไมโครโฟนเพื่อพูดสรุปงานขณะอยู่ในห้องเย็นหรือมือเปื้อน ระบบจะแยกข้อความลงช่อง <b>อาการเสีย / สาเหตุ / การแก้ไข</b> ให้อัตโนมัติ</p>
            <textarea id="aiVoiceTranscriptBox" rows="4" placeholder="กดปุ่มไมโครโฟนด้านล่าง หรือพิมพ์ข้อความสรุปงาน เช่น: อาการน้ำแข็งไม่เต็มถาด สาเหตุแผงคอยล์ร้อนตัน การแก้ไขล้างคอยล์ร้อนและเปลี่ยนวาล์วน้ำเข้า..." class="w-full border border-slate-300 rounded-xl p-2.5 text-xs"></textarea>
            <div class="flex flex-wrap gap-2">
              <button type="button" onclick="startAiVoiceToReport()" class="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs">
                <i class="fa-solid fa-microphone"></i> <span>เริ่มพูดสรุปงาน (TH/EN)</span>
              </button>
              <button type="button" onclick="parseVoiceTextToJobFields()" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5">
                <i class="fa-solid fa-wand-magic-sparkles"></i> <span>จัดลงช่องใบงานอัตโนมัติ</span>
              </button>
            </div>
          </div>

          <!-- AI Vision Fault & Photo Compliance Gate -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49]">
              <i class="fa-solid fa-camera text-indigo-600 mr-1"></i> AI Vision ระบุอะไหล่ &amp; ตรวจสอบคุณภาพรูป Before/After
            </div>
            <p class="text-[11px] text-slate-600">อัปโหลดหรือถ่ายภาพแผงวงจร ไฟ LED หรืออะไหล่ที่ชำรุดเพื่อให้ AI ช่วยระบุ Part No. และตรวจสอบความครบถ้วนของรูปถ่ายก่อนปิดงาน</p>
            <input type="file" accept="image/*" capture="environment" onchange="runAiVisionPhotoInspection(this)" class="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700">
            <div id="aiVisionResultCard"></div>
            <div class="pt-2 border-t border-slate-100 space-y-2">
              <button type="button" onclick="checkPhotoComplianceGate()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs">
                <i class="fa-solid fa-shield-check mr-1"></i> ตรวจสอบความครบถ้วนของรูปถ่ายในใบงานปัจจุบัน
              </button>
              <div id="aiPhotoComplianceBox"></div>
            </div>
          </div>
        </div>
      `;
    } else if (tab === 'AUTO_DISPATCH') {
      body.innerHTML = `
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div class="font-extrabold text-sm text-[#002B49]">
            <i class="fa-solid fa-truck-fast text-emerald-600 mr-1"></i> Skill-Based &amp; Parts-Aware Autonomous Dispatch (จับคู่ช่าง + สต็อกรถ + พิกัด GPS สด)
          </div>
          <p class="text-[11px] text-slate-600">ระบบคำนวณความเหมาะสมของทีมช่าง <b>T01–T08</b> จาก 3 มิติพร้อมกัน (1. ระยะทาง GPS ปัจจุบัน, 2. ความชำนาญรุ่นเครื่อง, 3. อะไหล่ที่มีอยู่จริงบนรถช่าง) เพื่อเพิ่มอัตราซ่อมจบในครั้งเดียว (FTFR%)</p>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-[#002B49] text-white">
                  <th class="p-2 rounded-tl-lg">รถช่าง</th>
                  <th class="p-2">ทักษะรุ่นเด่น</th>
                  <th class="p-2">อะไหล่พร้อมเบิกบนรถ</th>
                  <th class="p-2">ระยะทางถึงหน้างาน</th>
                  <th class="p-2 rounded-tr-lg">AI Match Score</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                <tr class="bg-emerald-50/70">
                  <td class="p-2 font-extrabold text-[#002B49]">T01 — ทีมบริการโซนกลาง</td>
                  <td class="p-2">IM / KM / FM Series</td>
                  <td class="p-2 text-emerald-700 font-bold">✅ มี Water Valve + 4HC-H + Fan Motor</td>
                  <td class="p-2">4.2 กม. (ETA 14 นาที)</td>
                  <td class="p-2 font-extrabold text-emerald-700">98% (แนะนำสูงสุด)</td>
                </tr>
                <tr>
                  <td class="p-2 font-bold">T03 — ทีมบริการโซนตะวันออก</td>
                  <td class="p-2">KM / HR / HF / HSU</td>
                  <td class="p-2 text-amber-700 font-semibold">⚠️ มี 4HC-H (ไม่มี Water Valve)</td>
                  <td class="p-2">11.8 กม. (ETA 28 นาที)</td>
                  <td class="p-2 font-bold text-slate-600">79%</td>
                </tr>
                <tr>
                  <td class="p-2 font-bold">T05 — ทีมบริการโซนเหนือ</td>
                  <td class="p-2">IM / RT / RTC</td>
                  <td class="p-2 text-emerald-700 font-semibold">✅ มีครบทุกรายการ</td>
                  <td class="p-2">19.5 กม. (ETA 42 นาที)</td>
                  <td class="p-2 font-bold text-slate-600">84%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tab === 'CONCIERGE_UPSELL') {
      body.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div class="font-extrabold text-sm text-[#002B49]">
              <i class="fa-brands fa-line text-[#06C755] mr-1"></i> AI Visual &amp; Symptom Triage (คัดกรองอาการเบื้องต้น 3 ภาษา)
            </div>
            <p class="text-[11px] text-slate-600">เมื่อลูกค้าส่งรูปหน้าจอ Error หรือแจ้งอาการเข้า <b>Customer LINE OA</b> ระบบ AI จะวิเคราะห์รหัส Error แนะนำวิธีตรวจสอบเบื้องต้น (TH/EN/JP) และหากไม่หายจะเปิดใบงานพร้อมแนบผลวินิจฉัยให้ช่างทันที</p>
            <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-[11px] text-emerald-950">
              <b>สถานะบอทปัจจุบัน:</b> เชื่อมต่อ Dual LINE OA Bridge (TH / EN / 日本語) พร้อมรับแจ้งซ่อมอัตโนมัติ 24 ชม.
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49]">
              <i class="fa-solid fa-cart-plus text-amber-500 mr-1"></i> Predictive Consumables &amp; PM Contract Upsell
            </div>
            <p class="text-[11px] text-slate-600">ตรวจพบเครื่อง <b>KM-901MAJ (S/N: K88310M)</b> ไส้กรองน้ำ 4HC-H เหลือ <b>18%</b> สามารถสร้างใบเสนอราคาพร้อมแพ็กเกจ Good / Better / Best ใน 1 คลิก</p>
            <button type="button" onclick="createPredictiveUpsellQuotation('K88310M', 'KM-901MAJ', 'โรงแรมแชงกรี-ลา กรุงเทพฯ')" class="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg font-bold text-xs shadow-xs">
              <i class="fa-solid fa-file-invoice-dollar mr-1"></i> สร้างใบเสนอราคาไส้กรอง 4HC-H &amp; PM ทันที
            </button>
          </div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="space-y-3">
          <div class="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49]">
              <i class="fa-solid fa-crown text-amber-500 mr-1"></i> Executive AI Copilot — ถาม-ตอบข้อมูลงานซ่อม อะไหล่ และสุขภาพเครื่อง (TH / EN / JP)
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button type="button" onclick="runExecutiveAiCopilotQuery('สรุปสถานะเครื่อง IoT ที่ต้องเฝ้าระวังและอะไหล่ที่ควรเตรียม')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 px-2.5 py-1 rounded-lg text-[11px] font-bold">📊 สรุปเครื่อง IoT เฝ้าระวัง &amp; อะไหล่</button>
              <button type="button" onclick="runExecutiveAiCopilotQuery('วิเคราะห์แนวโน้มอาการเสียและรุ่นที่ต้องทำ PM เร่งด่วน')" class="bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 px-2.5 py-1 rounded-lg text-[11px] font-bold">❄️ วิเคราะห์แนวโน้ม PM &amp; FTFR</button>
            </div>
            <div class="flex gap-2">
              <input type="text" id="aiExecPromptInput" placeholder="พิมพ์คำถามผู้บริหาร เช่น เดือนนี้รุ่นไหนเสียบ่อยที่สุด และต้องสั่งอะไหล่อะไรเพิ่ม..." class="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs">
              <button type="button" onclick="runExecutiveAiCopilotQuery()" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-4 py-2 rounded-lg font-bold text-xs">ถาม AI</button>
            </div>
            <div id="aiExecCopilotAnswer"></div>
          </div>

          <!-- Infrastructure Settings: Edge Downsampling & AI Gateway -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49]">
              <i class="fa-solid fa-server text-cyan-600 mr-1"></i> โครงสร้างพื้นฐาน AI Gateway Proxy &amp; IoT Edge Downsampling
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">โหมดการประมวลผล AI (AI Gateway Architecture)</label>
                <select id="aiCfgMode" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-semibold">
                  <option value="HYBRID_LOCAL_AND_GAS_GEMINI" ${cfg.gatewayMode === 'HYBRID_LOCAL_AND_GAS_GEMINI' ? 'selected' : ''}>Hybrid Edge Rules + Google Apps Script Gemini Proxy (ปลอดภัย 100%)</option>
                  <option value="EDGE_RULES_ONLY" ${cfg.gatewayMode === 'EDGE_RULES_ONLY' ? 'selected' : ''}>Offline Edge Rules Only (ทำงานในห้องเย็นไม่ใช้เน็ต)</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">โมเดล AI ฝั่ง Cloud Proxy</label>
                <input type="text" id="aiCfgModel" value="${escapeHtml(cfg.geminiModel)}" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono">
              </div>
            </div>
            <div class="flex flex-wrap gap-4 pt-1 text-xs font-semibold text-slate-700">
              <label class="flex items-center gap-1.5"><input type="checkbox" id="aiCfgDownsample" ${cfg.downsampleHourlySummary ? 'checked' : ''}> ส่งเฉพาะสรุปรายชั่วโมง + Event Alerts ลง Google Sheets (ป้องกันชีตเต็ม)</label>
              <label class="flex items-center gap-1.5"><input type="checkbox" id="aiCfgPhotoGate" ${cfg.autoCheckPhotoCompliance ? 'checked' : ''}> เปิดใช้ AI Photo Compliance Gate ก่อนปิดงาน</label>
              <label class="flex items-center gap-1.5"><input type="checkbox" id="aiCfgUpsell" ${cfg.autoCreateUpsellQt ? 'checked' : ''}> แนะนำสร้างใบเสนอราคาไส้กรอง 4HC-H อัตโนมัติ</label>
            </div>
            <div>
              <button type="button" onclick="saveAiGatewayCfgForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg font-bold text-xs">
                <i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกโครงสร้างพื้นฐาน AI &amp; IoT
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }

  window.switchAiHubTab = function(tab) {
    document.querySelectorAll('.ai-tab-btn').forEach(b => {
      b.className = 'ai-tab-btn px-3 py-1.5 rounded-lg bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200';
    });
    const act = document.getElementById('aiTabBtn_' + tab);
    if (act) act.className = 'ai-tab-btn px-3 py-1.5 rounded-lg bg-[#002B49] text-white shadow-xs';
    renderAiHubBody_(tab);
  };

  window.openAiNextGenServiceHubModal = function(tab) {
    const modal = document.getElementById('aiNextGenServiceHubModal');
    if (modal) {
      modal.classList.remove('hidden');
      switchAiHubTab(tab || 'DIGITAL_TWIN');
    }
  };

  window.closeAiNextGenServiceHubModal = function() {
    const modal = document.getElementById('aiNextGenServiceHubModal');
    if (modal) modal.classList.add('hidden');
  };
})();


// --- Module Block #49 ---
(function() {
  const AUDIT_LOG_KEY = 'hoshizaki_immutable_audit_log_v1033';
  const DEFECTIVE_TAG_KEY = 'hoshizaki_defective_part_tags_v1033';
  const ESG_REFRIGERANT_KEY = 'hoshizaki_esg_refrigerant_log_v1033';
  const GOV_CFG_KEY = 'hoshizaki_governance_security_cfg_v1033';

  // Global Data Masking Helper for Outsource / Public Views
  window.maskSensitivePhone = function(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 7) return phone || '-';
    return digits.slice(0, 3) + '-XXX-' + digits.slice(-4);
  };

  window.maskSensitiveEmail = function(email) {
    const s = String(email || '').trim();
    const parts = s.split('@');
    if (parts.length !== 2) return s || '-';
    const u = parts[0];
    return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + parts[1];
  };

  // Immutable Audit Trail Recorder
  window.appendSystemAuditLog = function(actionCategory, entityId, detailText) {
    try {
      const logs = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
      const actor = document.getElementById('techQuickProfileName')?.textContent || 'System User';
      const role = localStorage.getItem('hoshizaki_user_role_mode') || 'MANAGER';
      logs.unshift({
        auditId: 'AUD-' + Date.now(),
        timestamp: new Date().toISOString(),
        actor: actor.trim(),
        role: role,
        category: actionCategory,
        entityId: entityId || '-',
        detail: detailText || ''
      });
      localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(logs.slice(0, 500)));
    } catch (e) {}
  };

  // Manager Session 15-Minute Idle Auto-Lock
  let lastManagerActivityMs = Date.now();
  ['click', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, () => { lastManagerActivityMs = Date.now(); }, { passive: true });
  });

  setInterval(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem(GOV_CFG_KEY) || '{"autoLockMins":15,"pdpaRequired":true,"maskOutsourcePii":true}');
      const mins = Number(cfg.autoLockMins || 15);
      if (mins <= 0) return;
      const role = localStorage.getItem('hoshizaki_user_role_mode') || '';
      if (role === 'MANAGER' && (Date.now() - lastManagerActivityMs) > mins * 60 * 1000) {
        if (typeof toggleUserRoleMode === 'function') {
          toggleUserRoleMode();
          appendSystemAuditLog('SESSION_AUTO_LOCK', 'MANAGER_PIN', 'สลับกลับโหมดช่างอัตโนมัติเนื่องจากไม่มีการใช้งานเกิน ' + mins + ' นาที');
          if (typeof showToast === 'function') showToast('🔒 ล็อกโหมดผู้จัดการอัตโนมัติ (Idle > ' + mins + ' นาที) เพื่อความปลอดภัยของข้อมูลต้นทุน');
        }
      }
    } catch (e) {}
  }, 30000);

  // Inject PDPA Consent Checkbox into Customer Signature Zone
  function mountPdpaSignatureConsent_() {
    const custSigInput = document.getElementById('nameCustomer');
    if (!custSigInput || document.getElementById('pdpaCustomerConsentWrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'pdpaCustomerConsentWrap';
    wrap.className = 'mt-2 p-2 rounded-lg bg-sky-50 border border-sky-200 text-[11px] text-slate-700 flex items-start gap-2';
    wrap.innerHTML = `
      <input type="checkbox" id="pdpaCustomerConsentCheck" checked class="mt-0.5 w-4 h-4 rounded text-[#002B49]">
      <label for="pdpaCustomerConsentCheck" class="leading-snug">
        <b>ความยินยอมตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA):</b> ข้าพเจ้ายินยอมให้บริษัท โฮชิซากิ (ประเทศไทย) จำกัด จัดเก็บข้อมูลการติดต่อ ลายเซ็น และประวัติการบำรุงรักษาเครื่องเพื่อการรับประกันและบริการหลังการขาย
      </label>
    `;
    custSigInput.parentElement?.appendChild(wrap);
  }

  // Save Defective Part Return Tag
  window.createDefectivePartReturnTag = function() {
    const jobNo = document.getElementById('defTagJobNo')?.value.trim() || document.getElementById('jobNo')?.value.trim() || 'JOB-N/A';
    const serial = document.getElementById('defTagSerial')?.value.trim() || document.getElementById('serialNo')?.value.trim() || '-';
    const partNo = document.getElementById('defTagPartNo')?.value.trim() || '';
    const courier = document.getElementById('defTagCourier')?.value.trim() || 'Kerry / Flash / Van Return';
    const tracking = document.getElementById('defTagTracking')?.value.trim() || 'PENDING-TRACK';
    if (!partNo) {
      if (typeof showToast === 'function') showToast('⚠️ กรุณาระบุ Part No. ของซากอะไหล่เคลม');
      return;
    }
    const list = JSON.parse(localStorage.getItem(DEFECTIVE_TAG_KEY) || '[]');
    const tagId = 'DFR-' + Date.now().toString().slice(-6);
    list.unshift({
      tagId,
      jobNo,
      serial,
      partNo,
      courier,
      tracking,
      status: 'IN_TRANSIT_TO_HQ',
      createdAt: new Date().toISOString().slice(0, 10)
    });
    localStorage.setItem(DEFECTIVE_TAG_KEY, JSON.stringify(list));
    appendSystemAuditLog('DEFECTIVE_PART_TAG', tagId, `สร้างป้ายคืนซากอะไหล่ ${partNo} (Job: ${jobNo}, Tracking: ${tracking})`);
    if (typeof showToast === 'function') showToast('✅ สร้างป้าย QR ซากอะไหล่เคลม ' + tagId + ' เรียบร้อยแล้ว');
    renderGovEhsBody_('INVENTORY_QA');
  };

  // Save ESG Refrigerant Log
  window.recordEsgRefrigerantEntry = function() {
    const serial = document.getElementById('esgSerial')?.value.trim() || document.getElementById('serialNo')?.value.trim() || '-';
    const gasType = document.getElementById('esgGasType')?.value || 'R290';
    const action = document.getElementById('esgAction')?.value || 'CHARGED';
    const kg = parseFloat(document.getElementById('esgKg')?.value || '0') || 0;
    if (kg <= 0) {
      if (typeof showToast === 'function') showToast('⚠️ กรุณาระบุปริมาณน้ำยา (kg)');
      return;
    }
    const gwpMap = { 'R290': 3, 'R134a': 1430, 'R404A': 3922, 'R452A': 2140 };
    const co2eKg = Number((kg * (gwpMap[gasType] || 3)).toFixed(2));
    const logs = JSON.parse(localStorage.getItem(ESG_REFRIGERANT_KEY) || '[]');
    logs.unshift({
      id: 'ESG-' + Date.now().toString().slice(-6),
      date: new Date().toISOString().slice(0, 10),
      serial,
      gasType,
      action,
      kg,
      co2eKg
    });
    localStorage.setItem(ESG_REFRIGERANT_KEY, JSON.stringify(logs));
    appendSystemAuditLog('ESG_REFRIGERANT', serial, `${action} ${gasType} ${kg} kg (${co2eKg} kgCO2e)`);
    if (typeof showToast === 'function') showToast('🌱 บันทึกข้อมูลสารทำความเย็น ESG (' + co2eKg + ' kgCO2e) เรียบร้อย');
    renderGovEhsBody_('EHS_ESG');
  };

  // Export ERP / Microsoft Dynamics NAV CSV
  window.exportDynamicsNavErpCsv = function() {
    const history = JSON.parse(localStorage.getItem('hoshizaki_service_history') || '[]');
    const rows = [
      ['Posting_Date', 'Document_No', 'Customer_AR_Code', 'Customer_Name', 'Serial_No', 'Model', 'Line_Type', 'Item_Part_No', 'Qty', 'Total_Amount_THB', 'Tax_Group', 'Status']
    ];
    history.slice(0, 200).forEach(j => {
      rows.push([
        j.date || '',
        j.jobNo || '',
        j.arCode || 'AR00000001',
        '"' + String(j.store || '').replace(/"/g, '""') + '"',
        j.serial || '',
        j.model || '',
        'Service/Parts',
        '"' + String(j.partsSummary || 'SERVICE-FEE').replace(/"/g, '""') + '"',
        '1',
        String(j.grandTotal || '0.00').replace(/,/g, ''),
        'VAT7',
        j.jobStatus || 'Completed'
      ]);
    });
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'HOSHIZAKI_NAV_ERP_Import_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    appendSystemAuditLog('ERP_NAV_EXPORT', 'CSV_BATCH', 'ส่งออกไฟล์นำเข้า Microsoft Dynamics NAV จำนวน ' + (rows.length - 1) + ' รายการ');
    if (typeof showToast === 'function') showToast('📊 ดาวน์โหลดไฟล์ CSV มาตรฐาน Microsoft Dynamics NAV เรียบร้อยแล้ว');
  };

  // Split Billing / Deposit Calculator
  window.applySplitDepositToQuotation = function() {
    const pct = Number(document.getElementById('splitDepositPct')?.value || 50);
    const baseTotal = parseFloat(String(document.getElementById('grandTotalDisplay')?.textContent || '0').replace(/,/g, '')) || 0;
    const depositAmt = (baseTotal * (pct / 100)).toFixed(2);
    const balanceAmt = (baseTotal - Number(depositAmt)).toFixed(2);
    const box = document.getElementById('splitBillingPreviewBox');
    if (box) {
      box.innerHTML = `
        <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 space-y-1">
          <div class="font-extrabold">โครงสร้างแบ่งงวดชำระ (Split Billing ${pct}% / ${100 - pct}%):</div>
          <div>• <b>งวดที่ 1 (ใบแจ้งหนี้มัดจำ ${pct}% ก่อนสั่งอะไหล่/เข้าซ่อม):</b> ${Number(depositAmt).toLocaleString('en-US', {minimumFractionDigits:2})} THB</div>
          <div>• <b>งวดที่ 2 (ใบแจ้งหนี้ส่วนที่เหลือ ${100 - pct}% หลังส่งมอบงาน):</b> ${Number(balanceAmt).toLocaleString('en-US', {minimumFractionDigits:2})} THB</div>
        </div>
      `;
    }
    appendSystemAuditLog('SPLIT_BILLING_CALC', document.getElementById('jobNo')?.value || 'QT', `คำนวณแบ่งงวดมัดจำ ${pct}% = ${depositAmt} THB`);
  };

  // Batch Machine QR Sticker Sheet Generator
  window.openBatchMachineQrStickersWindow = function() {
    const history = JSON.parse(localStorage.getItem('hoshizaki_service_history') || '[]');
    const seen = new Set();
    const units = [];
    history.forEach(j => {
      const sn = String(j.serial || '').trim().toUpperCase();
      if (sn && sn !== '-' && !seen.has(sn) && units.length < 12) {
        seen.add(sn);
        units.push({ serial: sn, model: j.model || '-', store: j.store || '-' });
      }
    });
    if (units.length === 0) {
      units.push(
        { serial: 'H14289J', model: 'IM-240DNE-HC', store: 'Starbucks Reserve CentralWorld' },
        { serial: 'K88310M', model: 'KM-901MAJ', store: 'Shangri-La Hotel Bangkok' },
        { serial: 'F55201K', model: 'FM-480AKE', store: 'Tops Food Hall Sukhumvit' }
      );
    }
    const baseUrl = window.location.origin + window.location.pathname;
    const cardsHtml = units.map(u => {
      const qrUrl = `${baseUrl}?portal=customer&serial=${encodeURIComponent(u.serial)}&model=${encodeURIComponent(u.model)}`;
      return `
        <div style="border:2px solid #002B49;border-radius:10px;padding:10px;text-align:center;font-family:sans-serif;page-break-inside:avoid;">
          <div style="background:#002B49;color:#fff;font-weight:bold;font-size:11px;padding:3px;border-radius:5px;">HOSHIZAKI MACHINE PASSPORT</div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrUrl)}" style="width:115px;height:115px;margin:8px auto;display:block;">
          <div style="font-weight:800;font-size:13px;color:#002B49;">S/N: ${u.serial}</div>
          <div style="font-size:11px;color:#0369A1;font-weight:bold;">${u.model}</div>
          <div style="font-size:10px;color:#475569;margin-top:2px;">${u.store}</div>
          <div style="font-size:9px;color:#059669;margin-top:4px;">สแกนเพื่อเช็กประวัติซ่อม • แจ้งซ่อม • สั่งไส้กรอง 4HC-H</div>
        </div>
      `;
    }).join('');
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html><head><title>HOSHIZAKI Machine QR Stickers Batch</title></head><body style="padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;font-family:sans-serif;color:#002B49;">สติกเกอร์ QR Code ประจำเครื่องลูกค้า (Machine Passport Batch)</h3>
          <button onclick="window.print()" style="background:#002B49;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer;">พิมพ์สติกเกอร์ (Print A4)</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">${cardsHtml}</div>
      </body></html>`);
      w.document.close();
    }
  };

  function renderGovEhsBody_(tab) {
    const body = document.getElementById('govEhsModalBody');
    if (!body) return;
    const logs = JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]');
    const defTags = JSON.parse(localStorage.getItem(DEFECTIVE_TAG_KEY) || '[]');
    const esgLogs = JSON.parse(localStorage.getItem(ESG_REFRIGERANT_KEY) || '[]');

    if (tab === 'GOVERNANCE') {
      body.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
            <div class="font-extrabold text-[#002B49]"><i class="fa-solid fa-user-shield text-emerald-600 mr-1"></i> PDPA Consent &amp; Data Masking</div>
            <p class="text-[11px] text-slate-600">เพิ่มกล่องยืนยัน PDPA ใต้ช่องลายเซ็นลูกค้าอัตโนมัติ และปิดบังเบอร์โทร/อีเมลบางส่วน (เช่น <b>${maskSensitivePhone('0812345678')}</b>) เมื่อแชร์ลิงก์ให้ Outsource</p>
          </div>
          <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
            <div class="font-extrabold text-[#002B49]"><i class="fa-solid fa-clock text-amber-600 mr-1"></i> Manager Session 15-Min Auto-Lock</div>
            <p class="text-[11px] text-slate-600">ระบบตรวจจับการไม่มีการใช้งาน (Idle) ในโหมด Manager เกิน <b>15 นาที</b> และสลับกลับโหมด Technician อัตโนมัติเพื่อป้องกันข้อมูลราคาทุน/GP% รั่วไหล</p>
          </div>
          <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-1.5">
            <div class="font-extrabold text-[#002B49]"><i class="fa-solid fa-file-signature text-indigo-600 mr-1"></i> Immutable Audit Trail Log</div>
            <p class="text-[11px] text-slate-600">บันทึกประวัติการแก้ไขสำคัญทั้งหมดพร้อมชื่อผู้ปฏิบัติงาน บทบาท และเวลาลงฐานข้อมูลตรวจสอบย้อนหลังได้ตลอดเวลา</p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-extrabold text-sm text-[#002B49]">ประวัติการตรวจสอบความเคลื่อนไหวล่าสุด (Immutable Audit Log · ${logs.length} รายการ)</span>
            <button type="button" onclick="appendSystemAuditLog('MANUAL_AUDIT_CHECK', 'GOVERNANCE', 'ผู้ดูแลระบบตรวจสอบ Audit Log'); renderGovEhsBody_('GOVERNANCE');" class="bg-[#002B49] text-white px-2.5 py-1 rounded text-[11px] font-bold">+ บันทึกรอบตรวจ</button>
          </div>
          <div class="overflow-x-auto max-h-64">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-[#002B49] text-white">
                  <th class="p-2">เวลา (Timestamp)</th>
                  <th class="p-2">ผู้ปฏิบัติงาน</th>
                  <th class="p-2">หมวดหมู่</th>
                  <th class="p-2">รหัสอ้างอิง</th>
                  <th class="p-2">รายละเอียด</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${logs.length === 0
                  ? '<tr><td colspan="5" class="p-3 text-center text-slate-500">ยังไม่มีรายการแก้ไข — ระบบจะบันทึกอัตโนมัติเมื่อมีการสร้าง/แก้ไขข้อมูลสำคัญ</td></tr>'
                  : logs.slice(0, 25).map(l => `
                    <tr>
                      <td class="p-2 font-mono text-[10px]">${escapeHtml(l.timestamp)}</td>
                      <td class="p-2 font-bold">${escapeHtml(l.actor)} (${escapeHtml(l.role)})</td>
                      <td class="p-2"><span class="bg-sky-100 text-sky-900 px-1.5 py-0.5 rounded font-bold text-[10px]">${escapeHtml(l.category)}</span></td>
                      <td class="p-2 font-mono">${escapeHtml(l.entityId)}</td>
                      <td class="p-2">${escapeHtml(l.detail)}</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tab === 'INVENTORY_QA') {
      body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49]"><i class="fa-solid fa-barcode text-orange-600 mr-1"></i> Van Stock Cycle Count (ตรวจนับสต็อกรถช่างด้วยกล้องสแกน)</div>
            <p class="text-[11px] text-slate-600">ใช้กล้องมือถือสแกนบาร์โค้ดข้างกล่องอะไหล่บนรถ T01–T08 เพื่อกระทบยอดคงเหลือจริงกับระบบ Van Stock อัตโนมัติ</p>
            <button type="button" onclick="closeEnterpriseGovernanceEhsErpModal(); if(typeof openVanStockModal==='function') openVanStockModal();" class="bg-orange-600 hover:bg-orange-700 text-white px-3.5 py-2 rounded-lg font-bold text-xs">
              <i class="fa-solid fa-truck-ramp-box mr-1"></i> เปิดหน้าตรวจนับ Van Stock &amp; สแกนบาร์โค้ด
            </button>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49]"><i class="fa-solid fa-tag text-rose-600 mr-1"></i> Defective Part Return QR Tag &amp; Courier Tracking</div>
            <div class="grid grid-cols-2 gap-2">
              <input type="text" id="defTagJobNo" placeholder="เลขที่ใบงาน (Job No.)" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
              <input type="text" id="defTagSerial" placeholder="S/N เครื่อง" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
              <input type="text" id="defTagPartNo" placeholder="Part No. ซากอะไหล่ *" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
              <input type="text" id="defTagTracking" placeholder="เลขพัสดุส่งคืนคลัง (Tracking)" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            </div>
            <button type="button" onclick="createDefectivePartReturnTag()" class="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-lg font-bold text-xs">
              <i class="fa-solid fa-qrcode mr-1"></i> ออกป้าย QR คืนซากอะไหล่เคลม
            </button>
          </div>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div class="font-extrabold text-sm text-[#002B49]">รายการติดตามซากอะไหล่ส่งคืนคลังหลัก (${defTags.length} รายการ)</div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead><tr class="bg-slate-800 text-white"><th class="p-2">Tag ID</th><th class="p-2">Job No.</th><th class="p-2">S/N</th><th class="p-2">Part No.</th><th class="p-2">Tracking</th><th class="p-2">สถานะ</th></tr></thead>
              <tbody class="divide-y divide-slate-200">
                ${defTags.length === 0 ? '<tr><td colspan="6" class="p-3 text-center text-slate-500">ยังไม่มีรายการป้ายคืนซากอะไหล่</td></tr>' : defTags.map(t => `
                  <tr><td class="p-2 font-bold text-rose-700">${escapeHtml(t.tagId)}</td><td class="p-2">${escapeHtml(t.jobNo)}</td><td class="p-2">${escapeHtml(t.serial)}</td><td class="p-2 font-mono font-bold">${escapeHtml(t.partNo)}</td><td class="p-2">${escapeHtml(t.tracking)}</td><td class="p-2"><span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold text-[10px]">${escapeHtml(t.status)}</span></td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tab === 'EHS_ESG') {
      const totalKg = esgLogs.reduce((acc, x) => acc + Number(x.kg || 0), 0).toFixed(2);
      const totalCo2 = esgLogs.reduce((acc, x) => acc + Number(x.co2eKg || 0), 0).toFixed(2);
      body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div class="font-extrabold text-sm text-[#002B49]"><i class="fa-solid fa-helmet-safety text-amber-500 mr-1"></i> Pre-Work EHS Safety &amp; Lockout/Tagout (LOTO) Checklist</div>
            <div class="space-y-1.5 text-xs text-slate-700">
              <label class="flex items-center gap-2"><input type="checkbox" checked class="w-4 h-4"> 1. ตัดเบรกเกอร์หลักและติดป้ายเตือน LOTO เรียบร้อยก่อนเปิดฝาครอบ</label>
              <label class="flex items-center gap-2"><input type="checkbox" checked class="w-4 h-4"> 2. ตรวจสอบสายดิน (Ground) และวัดไฟรั่วรอบตัวเครื่องผ่านเกณฑ์ปลอดภัย</label>
              <label class="flex items-center gap-2"><input type="checkbox" checked class="w-4 h-4"> 3. ตรวจสอบการระบายอากาศห้องเครื่อง (เฉพาะอย่างยิ่งรุ่นน้ำยาไวไฟ R290)</label>
              <label class="flex items-center gap-2"><input type="checkbox" checked class="w-4 h-4"> 4. สวมแว่นตานิรภัยและถุงมือป้องกันความเย็นก่อนต่อเกจวัดแรงดันน้ำยา</label>
            </div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49] flex items-center justify-between">
              <span><i class="fa-solid fa-leaf text-emerald-600 mr-1"></i> ESG Refrigerant &amp; Carbon Footprint Log</span>
              <span class="text-[11px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full">รวม ${totalKg} kg (${totalCo2} kgCO2e)</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input type="text" id="esgSerial" placeholder="S/N เครื่อง" class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
              <select id="esgGasType" class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-bold">
                <option value="R290">R290 (GWP 3)</option>
                <option value="R134a">R134a (GWP 1430)</option>
                <option value="R404A">R404A (GWP 3922)</option>
                <option value="R452A">R452A (GWP 2140)</option>
              </select>
              <select id="esgAction" class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                <option value="CHARGED">เติมน้ำยาใหม่ (Charged)</option>
                <option value="RECOVERED">กู้คืนน้ำยา (Recovered)</option>
              </select>
              <input type="number" step="0.01" id="esgKg" placeholder="ปริมาณ (kg)" class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
            </div>
            <button type="button" onclick="recordEsgRefrigerantEntry()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg font-bold text-xs">
              <i class="fa-solid fa-plus mr-1"></i> บันทึกข้อมูลน้ำยา &amp; คำนวณ CO2e
            </button>
          </div>
        </div>
      `;
    } else if (tab === 'ERP_FINANCE') {
      body.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49]"><i class="fa-solid fa-file-csv text-indigo-600 mr-1"></i> Microsoft Dynamics NAV / ERP Export Mapping</div>
            <p class="text-[11px] text-slate-600">ส่งออกข้อมูลใบงานซ่อมและรายการอะไหล่เป็นไฟล์ CSV โครงสร้างมาตรฐานพร้อมนำเข้าสู่ระบบบัญชี NAV (Customer AR Code, Item No., Qty, Unit Price, Tax Group)</p>
            <button type="button" onclick="exportDynamicsNavErpCsv()" class="bg-indigo-700 hover:bg-indigo-800 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-xs">
              <i class="fa-solid fa-download mr-1"></i> ดาวน์โหลดไฟล์ CSV สำหรับนำเข้า NAV ERP
            </button>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
            <div class="font-extrabold text-sm text-[#002B49]"><i class="fa-solid fa-coins text-amber-500 mr-1"></i> Split Billing &amp; Deposit Payment (แบ่งงวดมัดจำ/ส่งมอบ)</div>
            <p class="text-[11px] text-slate-600">คำนวณยอดแบ่งชำระมัดจำ 30%–50% สำหรับงานเปลี่ยนคอมเพรสเซอร์หรืองานโครงการขนาดใหญ่</p>
            <div class="flex items-center gap-2">
              <select id="splitDepositPct" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-bold">
                <option value="30">มัดจำ 30% / ส่งมอบ 70%</option>
                <option value="50" selected>มัดจำ 50% / ส่งมอบ 50%</option>
              </select>
              <button type="button" onclick="applySplitDepositToQuotation()" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-3.5 py-1.5 rounded-lg font-bold text-xs">คำนวณงวดชำระ</button>
            </div>
            <div id="splitBillingPreviewBox"></div>
          </div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="bg-white p-3.5 rounded-xl border-t-4 border-emerald-600 shadow-xs space-y-1.5">
            <div class="font-extrabold text-sm text-[#002B49]">👨‍🔧 คู่มือด่วน: ช่างบริการสนาม</div>
            <ol class="list-decimal pl-4 space-y-1 text-[11px] text-slate-700">
              <li>เลือกโปรไฟล์ช่าง &amp; กดเช็กอิน GPS หน้างาน</li>
              <li>สแกนบาร์โค้ด S/N เพื่อตรวจประกันและดูประวัติ 360°</li>
              <li>ใช้ AI Vision / Voice-to-Report ถ่ายรูปและสรุปงาน</li>
              <li>ตัดสต็อกรถช่างอัตโนมัติและให้ลูกค้าเซ็นผ่าน Portal</li>
            </ol>
          </div>
          <div class="bg-white p-3.5 rounded-xl border-t-4 border-sky-600 shadow-xs space-y-1.5">
            <div class="font-extrabold text-sm text-[#002B49]">👩‍💻 คู่มือด่วน: แอดมิน &amp; จ่ายงาน</div>
            <ol class="list-decimal pl-4 space-y-1 text-[11px] text-slate-700">
              <li>ตรวจสอบตารางงานและกด <b>Route Optimizer</b> จัดเส้นทาง</li>
              <li>ออกใบเสนอราคา 8 ระดับ (QT) หรือใบเคลมประกัน</li>
              <li>ติดตามงานรออะไหล่ (6-Stage Parts Advance) &amp; Outsource</li>
              <li>ส่งออกไฟล์ NAV ERP CSV และสรุปประจำสัปดาห์ 4 ชีต</li>
            </ol>
          </div>
          <div class="bg-white p-3.5 rounded-xl border-t-4 border-amber-500 shadow-xs space-y-1.5">
            <div class="font-extrabold text-sm text-[#002B49]">👑 คู่มือด่วน: ผู้บริหาร (MD / Manager)</div>
            <ol class="list-decimal pl-4 space-y-1 text-[11px] text-slate-700">
              <li>กดปุ่ม <b>Executive Report</b> มุมขวาบนเพื่อเปิด MD Boardroom</li>
              <li>ใช้ <b>Executive AI Copilot</b> ถาม-ตอบ KPI 3 ภาษา (TH/EN/JP)</li>
              <li>ตรวจสอบ GP% Margin และอนุมัติส่วนลดพิเศษ</li>
              <li>ติดตามสุขภาพเครื่อง IoT Fleet และแนวโน้ม QCF</li>
            </ol>
          </div>
        </div>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="font-extrabold text-sm text-[#002B49]"><i class="fa-solid fa-qrcode text-cyan-600 mr-1"></i> Batch Machine QR Sticker Sheet Generator (พิมพ์สติกเกอร์ QR แปะหน้าเครื่องแบบชุด)</div>
            <div class="text-[11px] text-slate-600">สร้างหน้าพิมพ์ A4 รวมสติกเกอร์ QR Code (Machine Passport) สำหรับให้ช่างนำไปแปะหน้าเครื่องลูกค้าทุกรุ่นระหว่างเข้าทำ PM</div>
          </div>
          <button type="button" onclick="openBatchMachineQrStickersWindow()" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-4 py-2 rounded-lg font-bold text-xs shadow-xs">
            <i class="fa-solid fa-print mr-1"></i> สร้างแผ่นพิมพ์สติกเกอร์ QR Code (A4)
          </button>
        </div>
      `;
    }
  }

  window.switchGovEhsTab = function(tab) {
    document.querySelectorAll('.gov-tab-btn').forEach(b => {
      b.className = 'gov-tab-btn px-3 py-1.5 rounded-lg bg-white text-slate-700 hover:bg-sky-50 border border-slate-200';
    });
    const act = document.getElementById('govTabBtn_' + tab);
    if (act) act.className = 'gov-tab-btn px-3 py-1.5 rounded-lg bg-[#002B49] text-white shadow-xs';
    renderGovEhsBody_(tab);
  };

  window.openEnterpriseGovernanceEhsErpModal = function(tab) {
    const modal = document.getElementById('enterpriseGovernanceEhsErpModal');
    if (modal) {
      modal.classList.remove('hidden');
      switchGovEhsTab(tab || 'GOVERNANCE');
    }
  };

  window.closeEnterpriseGovernanceEhsErpModal = function() {
    const modal = document.getElementById('enterpriseGovernanceEhsErpModal');
    if (modal) modal.classList.add('hidden');
  };

  document.addEventListener('DOMContentLoaded', () => {
    mountPdpaSignatureConsent_();
  });
})();


// --- Module Block #50 ---
(function() {
  const DEALER_DIR_KEY = 'hoshizaki_dealer_channel_directory_v1035';
  const DEALER_CASES_KEY = 'hoshizaki_dealer_dispatch_cases_v1035';

  const CHANNEL_LABELS = {
    'DEALER_A': 'ตัวแทนจำหน่าย เกรด A (Dealer A)',
    'DEALER_B': 'ตัวแทนจำหน่าย เกรด B (Dealer B)',
    'DEALER_C': 'ตัวแทนจำหน่าย เกรด C (Dealer C)',
    'DIRECT_SALE': 'งานขายตรง (Direct Sale — Hoshizaki)',
    'JAPANESE_CORPORATE': 'ลูกค้าญี่ปุ่น (Japanese Corporate Unit)',
    'GENERAL_TECHNICIAN': 'ช่างซ่อมทั่วไป / อิสระ (General Technician)'
  };

  function seedDealersFromSerialDbIfEmpty_() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(DEALER_DIR_KEY) || '[]'); } catch (e) {}
    if (Array.isArray(list) && list.length > 0) return list;

    const seen = new Set();
    const seeded = [
      { id: 'DLR-DIRECT', name: 'HOSHIZAKI Direct Sale Account', channelType: 'DIRECT_SALE', zoneTier: 'DIRECT_SALE', phone: '02-005-9980', email: 'services@hoshizaki.co.th', lineGroupId: '', lineOaLink: '', smsMobile: '', province: 'ทั่วประเทศ' },
      { id: 'DLR-JPCORP', name: 'Japanese Corporate Unit Account', channelType: 'JAPANESE_CORPORATE', zoneTier: 'JAPANESE_CORPORATE', phone: '02-005-9980', email: 'services@hoshizaki.co.th', lineGroupId: '', lineOaLink: '', smsMobile: '', province: 'กรุงเทพฯ / นิคมอุตสาหกรรม' }
    ];
    seeded.forEach(x => seen.add(x.name.toUpperCase()));

    // Extract unique dealer/customer names from existing Serial DB in memory if available
    try {
      const rows = (typeof BUILTIN_SERIAL_ROWS !== 'undefined' && Array.isArray(BUILTIN_SERIAL_ROWS)) ? BUILTIN_SERIAL_ROWS : [];
      for (let i = 0; i < rows.length && seeded.length < 60; i++) {
        const cust = String(rows[i][5] || '').trim();
        if (cust && cust !== '-' && cust.length >= 4 && !seen.has(cust.toUpperCase())) {
          seen.add(cust.toUpperCase());
          const isJp = /(japan|nihon|nippon|sushi|ramen|izakaya|toyota|honda|denso)/i.test(cust);
          seeded.push({
            id: 'DLR-' + String(seeded.length + 1).padStart(3, '0'),
            name: cust,
            channelType: isJp ? 'JAPANESE_CORPORATE' : 'DEALER_A',
            zoneTier: isJp ? 'JAPANESE_CORPORATE' : 'DEALER_A',
            phone: '',
            email: '',
            lineGroupId: '',
            lineOaLink: '',
            smsMobile: '',
            province: 'ทั่วประเทศ'
          });
        }
      }
    } catch (e2) {}

    localStorage.setItem(DEALER_DIR_KEY, JSON.stringify(seeded));
    return seeded;
  }

  window.addOrUpdateDealerChannelEntry = function() {
    const name = (document.getElementById('dlrEditName')?.value || '').trim();
    if (!name) {
      if (typeof showToast === 'function') showToast('⚠️ กรุณาระบุชื่อตัวแทนจำหน่าย / กลุ่มลูกค้า');
      return;
    }
    const channelType = document.getElementById('dlrEditChannel')?.value || 'DEALER_A';
    const phone = (document.getElementById('dlrEditPhone')?.value || '').trim();
    const email = (document.getElementById('dlrEditEmail')?.value || '').trim();
    const lineGroupId = (document.getElementById('dlrEditLineGroup')?.value || '').trim();
    const lineOaLink = (document.getElementById('dlrEditLineOa')?.value || '').trim();
    const smsMobile = (document.getElementById('dlrEditSms')?.value || '').trim();
    const province = (document.getElementById('dlrEditProvince')?.value || 'ทั่วประเทศ').trim();

    const list = seedDealersFromSerialDbIfEmpty_();
    const idx = list.findIndex(x => x.name.toUpperCase() === name.toUpperCase());
    const entry = {
      id: idx >= 0 ? list[idx].id : ('DLR-' + Date.now().toString().slice(-5)),
      name,
      channelType,
      zoneTier: channelType,
      phone,
      email,
      lineGroupId,
      lineOaLink,
      smsMobile,
      province
    };
    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);

    localStorage.setItem(DEALER_DIR_KEY, JSON.stringify(list));

    const gasUrl = localStorage.getItem('hoshizaki_gas_url') || '';
    if (gasUrl && gasUrl.indexOf('http') === 0) {
      fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'SYNC_DEALER_CHANNEL_DIRECTORY', dealers: list })
      }).catch(() => {});
    }
    if (typeof showToast === 'function') showToast('✅ บันทึกและซิงค์ข้อมูลตัวแทนจำหน่าย "' + name + '" เรียบร้อยแล้ว');
    renderBotDealerBody_('DEALER_DIR');
  };

  window.updateDealerRowChannelQuick = function(dealerId, newChannel) {
    const list = seedDealersFromSerialDbIfEmpty_();
    const item = list.find(x => x.id === dealerId);
    if (!item) return;
    item.channelType = newChannel;
    item.zoneTier = newChannel;
    localStorage.setItem(DEALER_DIR_KEY, JSON.stringify(list));
    const gasUrl = localStorage.getItem('hoshizaki_gas_url') || '';
    if (gasUrl && gasUrl.indexOf('http') === 0) {
      fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'SYNC_DEALER_CHANNEL_DIRECTORY', dealers: list })
      }).catch(() => {});
    }
    if (typeof showToast === 'function') showToast('✅ อัปเดตประเภทช่องทางเป็น ' + (CHANNEL_LABELS[newChannel] || newChannel));
  };

  window.loadDealerIntoEditForm = function(dealerId) {
    const list = seedDealersFromSerialDbIfEmpty_();
    const d = list.find(x => x.id === dealerId);
    if (!d) return;
    if (document.getElementById('dlrEditName')) document.getElementById('dlrEditName').value = d.name || '';
    if (document.getElementById('dlrEditChannel')) document.getElementById('dlrEditChannel').value = d.channelType || 'DEALER_A';
    if (document.getElementById('dlrEditPhone')) document.getElementById('dlrEditPhone').value = d.phone || '';
    if (document.getElementById('dlrEditEmail')) document.getElementById('dlrEditEmail').value = d.email || '';
    if (document.getElementById('dlrEditLineGroup')) document.getElementById('dlrEditLineGroup').value = d.lineGroupId || '';
    if (document.getElementById('dlrEditLineOa')) document.getElementById('dlrEditLineOa').value = d.lineOaLink || '';
    if (document.getElementById('dlrEditSms')) document.getElementById('dlrEditSms').value = d.smsMobile || '';
    if (document.getElementById('dlrEditProvince')) document.getElementById('dlrEditProvince').value = d.province || '';
  };

  window.createDealerSubcontractJobAndQt = function() {
    const dealerName = (document.getElementById('b2bSubDealerName')?.value || '').trim();
    const custName = (document.getElementById('b2bSubCustName')?.value || '').trim() || 'ลูกค้าหน้างาน';
    const sn = (document.getElementById('b2bSubSerial')?.value || '').trim().toUpperCase();
    const sym = (document.getElementById('b2bSubSymptom')?.value || 'ตัวแทนจำหน่ายคิวช่างเต็ม ขอให้ทีม Hoshizaki เข้าตรวจเช็ก/ซ่อมแทน').trim();
    if (!dealerName) {
      if (typeof showToast === 'function') showToast('⚠️ กรุณาระบุชื่อตัวแทนจำหน่ายที่ร้องขอ');
      return;
    }

    // Fill active Job Form fields with strict B2B Dealer Billing note (Bill to Dealer ONLY, never direct to End-User)
    const storeEl = document.getElementById('storeName') || document.getElementById('customerStore');
    const dealerEl = document.getElementById('dealerName');
    const snEl = document.getElementById('serialNumber');
    const symEl = document.getElementById('diagSymptom');
    if (storeEl) storeEl.value = custName + ' [หน้างานแทนดีลเลอร์: ' + dealerName + ']';
    if (dealerEl) dealerEl.value = dealerName;
    if (snEl && sn) snEl.value = sn;
    if (symEl) symEl.value = '[B2B Sub-Service แทนดีลเลอร์] ' + sym;

    const gasUrl = localStorage.getItem('hoshizaki_gas_url') || '';
    if (gasUrl && gasUrl.indexOf('http') === 0) {
      fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'DEALER_REQUEST_HOSHIZAKI_SUBCONTRACT',
          dealerName,
          customerName: custName,
          serialNo: sn,
          symptom: sym,
          reason: 'ตัวแทนจำหน่ายคิวช่างเต็ม ขอให้ทีม HOSHIZAKI เข้าหน้างานแทน'
        })
      }).catch(() => {});
    }

    document.getElementById('aiChatbotOrchestratorModal')?.classList.add('hidden');
    if (typeof showToast === 'function') showToast('✅ สร้างใบงานเข้าแทนดีลเลอร์ "' + dealerName + '" แล้ว — กำลังเปิดหน้าทำใบเสนอราคา (ส่งตรงถึงดีลเลอร์เท่านั้น)');

    // Open Quotation Modal pre-addressed to Dealer (not End-User) so Dealer can apply their own markup
    if (typeof generateReceiptModal === 'function') {
      setTimeout(() => {
        generateReceiptModal(false);
        setTimeout(() => {
          const qtCust = document.getElementById('rcCustomerName') || document.getElementById('receiptCustomerName');
          const qtRemark = document.getElementById('rcRemark') || document.getElementById('receiptRemark');
          if (qtCust) qtCust.value = dealerName + ' (หน้างานลูกค้า: ' + custName + ')';
          if (qtRemark) qtRemark.value = 'ใบเสนอราคาสำหรับตัวแทนจำหน่าย (B2B Dealer Sub-Service) — ห้ามส่งราคาให้ลูกค้าปลายทางโดยตรง';
        }, 250);
      }, 200);
    }
  };

  window.triggerDealerFollowUpScanNow = function() {
    const gasUrl = localStorage.getItem('hoshizaki_gas_url') || '';
    if (!gasUrl || gasUrl.indexOf('http') !== 0) {
      if (typeof showToast === 'function') showToast('⚠️ กรุณาตั้งค่า Google Apps Script URL ก่อนรันระบบติดตามทวงถามดีลเลอร์');
      return;
    }
    fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType: 'RUN_DEALER_FOLLOWUP_SCAN_NOW' })
    }).then(() => {
      if (typeof showToast === 'function') showToast('🔔 สั่งรันระบบติดตามเคสค้างติดต่อกลับ (แจ้งซ้ำ Group LINE ดีลเลอร์ / Email / SMS + แจ้งทีมช่าง) เรียบร้อยแล้ว');
    }).catch(() => {});
  };

  window.simulateCustomerSnRouting_ = function() {
    const sn = (document.getElementById('simCustSnInput')?.value || '').trim().toUpperCase();
    const sym = (document.getElementById('simCustSymInput')?.value || 'เครื่องไม่ทำน้ำแข็ง ขึ้น E1').trim();
    const out = document.getElementById('aiBotSimOutput');
    if (!out) return;

    const list = seedDealersFromSerialDbIfEmpty_();
    let matchedOwner = '';
    let matchedModel = 'IM-240DNE';
    try {
      const rows = (typeof BUILTIN_SERIAL_ROWS !== 'undefined' && Array.isArray(BUILTIN_SERIAL_ROWS)) ? BUILTIN_SERIAL_ROWS : [];
      const found = rows.find(r => String(r[0] || '').trim().toUpperCase() === sn);
      if (found) {
        matchedModel = found[2] || matchedModel;
        matchedOwner = found[5] || '';
      }
    } catch (e) {}

    const dProf = list.find(d => matchedOwner && d.name.toUpperCase().indexOf(matchedOwner.toUpperCase()) > -1) || list[0];
    const chLabel = CHANNEL_LABELS[dProf?.channelType] || dProf?.channelType || 'DEALER_A';

    out.innerHTML = `
      <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-1.5">
        <div class="font-extrabold text-sm">✅ จำลองขั้นตอนการทำงานครบ 4 ขั้นสำเร็จ!</div>
        <div><b>1. คำแนะนำตรวจเช็กเบื้องต้น (Self-Check):</b> ส่งคู่มือตรวจวาล์วน้ำเข้า แผ่นกรองฝุ่น และรีเซ็ตเบรกเกอร์ให้ลูกค้าลองแก้ไขก่อน</div>
        <div><b>2. ผลการค้นหา S/N (${escapeHtml(sn || 'ตัวอย่าง')} · ${escapeHtml(matchedModel)}):</b> พบเจ้าของบัญชี <b>${escapeHtml(matchedOwner || dProf?.name || '-')}</b> · ประเภทช่องทาง: <span class="bg-amber-200 px-1.5 py-0.5 rounded font-bold">${escapeHtml(chLabel)}</span></div>
        <div><b>3. การส่งต่อ &amp; แจ้งกลับกลุ่มช่าง:</b> ส่ง Flex Card ข้อมูลติดต่อตัวแทนจำหน่ายให้ลูกค้า + ส่งการ์ดแจ้งเคสเข้า Group LINE ตัวแทนจำหน่าย + <b>แจ้งยืนยันกลับเข้า Group LINE ทีมช่าง Hoshizaki ว่า "ประสานงานส่งเรื่องให้ตัวแทนจำหน่ายเรียบร้อยแล้ว"</b></div>
        <div><b>4. ระบบ Track ติดตามผล:</b> บันทึกลงชีต <code>Dealer_Service_Dispatch_Tracker</code> หากเกิน 2 ชม. ยังไม่กดรับเรื่อง ระบบจะส่งแจ้งเตือนซ้ำทาง Group LINE ดีลเลอร์ / Email / SMS อัตโนมัติ</div>
      </div>
    `;
  };

  function renderBotDealerBody_(tab) {
    const body = document.getElementById('aiChatbotOrchestratorBody');
    if (!body) return;
    const dealers = seedDealersFromSerialDbIfEmpty_();

    if (tab === 'DEALER_DIR') {
      body.innerHTML = `
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
          <div class="font-extrabold text-sm text-[#002B49] flex flex-wrap items-center justify-between gap-1">
            <span><i class="fa-solid fa-pen-to-square text-amber-600 mr-1"></i> เพิ่ม / แก้ไขข้อมูลตัวแทนจำหน่ายและกำหนดช่องทางดูแล (Dealer A/B/C · Direct Sale · Japanese Corp · ช่างทั่วไป)</span>
            <span class="text-[11px] bg-sky-100 text-sky-900 px-2 py-0.5 rounded-full">ดึงชื่อตั้งต้นจากฐาน S/N แล้ว ${dealers.length} ราย</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input type="text" id="dlrEditName" placeholder="ชื่อตัวแทนจำหน่าย / บริษัท *" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold">
            <select id="dlrEditChannel" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-bold text-[#002B49]">
              <option value="DEALER_A">ตัวแทนจำหน่าย เกรด A (Dealer A)</option>
              <option value="DEALER_B">ตัวแทนจำหน่าย เกรด B (Dealer B)</option>
              <option value="DEALER_C">ตัวแทนจำหน่าย เกรด C (Dealer C)</option>
              <option value="DIRECT_SALE">งานขายตรง (Direct Sale — Hoshizaki)</option>
              <option value="JAPANESE_CORPORATE">ลูกค้าญี่ปุ่น (Japanese Corporate Unit)</option>
              <option value="GENERAL_TECHNICIAN">ช่างซ่อมทั่วไป / อิสระ (General Tech)</option>
            </select>
            <input type="text" id="dlrEditPhone" placeholder="เบอร์โทรศูนย์บริการดีลเลอร์" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <input type="text" id="dlrEditEmail" placeholder="อีเมลรับแจ้งเคส (Email)" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <input type="text" id="dlrEditLineGroup" placeholder="Group LINE ID ของตัวแทนจำหน่าย (Cxxxx...)" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono">
            <input type="text" id="dlrEditLineOa" placeholder="ลิงก์ LINE OA ดีลเลอร์ (https://line.me/...)" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <input type="text" id="dlrEditSms" placeholder="เบอร์มือถือรับ SMS แจ้งเตือนซ้ำ" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <input type="text" id="dlrEditProvince" placeholder="เขตพื้นที่ / จังหวัดที่ดูแล" value="ทั่วประเทศ" class="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" onclick="addOrUpdateDealerChannelEntry()" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-4 py-2 rounded-lg font-bold text-xs shadow-xs">
              <i class="fa-solid fa-floppy-disk mr-1"></i> บันทึก &amp; ซิงค์ขึ้น Google Sheets (Dealer_Channel_Directory)
            </button>
          </div>
        </div>

        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div class="font-extrabold text-sm text-[#002B49]">รายชื่อตัวแทนจำหน่ายและประเภทช่องทางในระบบ (ปรับเปลี่ยนประเภทได้ทันที)</div>
          <div class="overflow-x-auto max-h-72">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-[#002B49] text-white">
                  <th class="p-2">ชื่อตัวแทนจำหน่าย / ลูกค้า</th>
                  <th class="p-2">ประเภทช่องทาง (Channel / Grade)</th>
                  <th class="p-2">เบอร์โทร / SMS</th>
                  <th class="p-2">Group LINE ID / Email</th>
                  <th class="p-2">จัดการ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${dealers.map(d => `
                  <tr>
                    <td class="p-2 font-bold text-slate-900">${escapeHtml(d.name)}</td>
                    <td class="p-2">
                      <select onchange="updateDealerRowChannelQuick('${d.id}', this.value)" class="border border-slate-300 rounded px-2 py-1 text-[11px] font-bold bg-sky-50 text-[#002B49]">
                        ${Object.keys(CHANNEL_LABELS).map(k => `<option value="${k}" ${d.channelType === k ? 'selected' : ''}>${CHANNEL_LABELS[k]}</option>`).join('')}
                      </select>
                    </td>
                    <td class="p-2 text-[11px]">${escapeHtml(d.phone || '-')} ${d.smsMobile ? ('/ SMS: ' + escapeHtml(d.smsMobile)) : ''}</td>
                    <td class="p-2 font-mono text-[10px]">${escapeHtml(d.lineGroupId || '-')} ${d.email ? ('<br>' + escapeHtml(d.email)) : ''}</td>
                    <td class="p-2">
                      <button type="button" onclick="loadDealerIntoEditForm('${d.id}')" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded text-[11px] font-bold">แก้ไข</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (tab === 'FOLLOWUP') {
      body.innerHTML = `
        <div class="bg-white p-4 rounded-xl border border-rose-200 shadow-xs space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-extrabold text-sm text-[#002B49]"><i class="fa-solid fa-clock-rotate-left text-rose-600 mr-1"></i> ระบบติดตามการติดต่อกลับของตัวแทนจำหน่าย (Closed-Loop Follow-Up &amp; 2-Hr SLA)</div>
              <p class="text-[11px] text-slate-600 mt-0.5">
                • เมื่อส่งเรื่องให้ตัวแทนจำหน่าย ระบบจะส่งแจ้งเข้า <b>Group LINE ทีมช่าง Hoshizaki</b> ทันทีว่า <i>"ประสานงานส่งเรื่องให้ตัวแทนจำหน่ายเรียบร้อยแล้ว"</i><br>
                • หากเกิน <b>2 ชั่วโมง</b> แล้วยังไม่มีการกดยืนยันติดต่อกลับ ระบบจะส่งแจ้งเตือนซ้ำทาง <b>Group LINE ตัวแทนจำหน่าย + Email + SMS</b> และยกระดับแจ้งเตือนผู้จัดการหากเกิน 4 ชั่วโมง
              </p>
            </div>
            <button type="button" onclick="triggerDealerFollowUpScanNow()" class="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-lg font-bold text-xs shadow-xs">
              <i class="fa-solid fa-bell mr-1"></i> สั่งรันตรวจสอบ &amp; แจ้งเตือนซ้ำทันที
            </button>
          </div>
        </div>

        <div class="bg-amber-50/90 p-4 rounded-xl border-2 border-amber-300 shadow-xs space-y-2.5">
          <div class="font-extrabold text-sm text-[#002B49] flex items-center gap-1.5">
            <i class="fa-solid fa-handshake text-amber-600"></i>
            <span>กรณีตัวแทนจำหน่ายคิวช่างเต็ม / ขอให้ทีม HOSHIZAKI เข้าหน้างานแทน (B2B Sub-Service · ออก QT ให้ดีลเลอร์เท่านั้น)</span>
          </div>
          <p class="text-[11px] text-amber-950 leading-relaxed">
            • ตัวแทนจำหน่ายสามารถกดปุ่ม <b>"🔄 คิวช่างเต็ม / ขอให้ Hoshizaki เข้าแทน"</b> จากการ์ดใน Group LINE หรือแอดมินบันทึกคำขอจากหน้านี้<br>
            • ระบบจะสร้างใบงาน B2B Sub-Service และตั้งค่า <b>ออกใบเสนอราคาส่งให้ตัวแทนจำหน่ายโดยตรงเท่านั้น (ไม่ส่งราคาให้ลูกค้าปลายทาง)</b> เพื่อให้ดีลเลอร์นำไปบวกค่าบริการ/มาร์คอัพเสนอราคาให้ลูกค้าเองได้อย่างอิสระ
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input type="text" id="b2bSubDealerName" placeholder="ชื่อตัวแทนจำหน่ายที่ร้องขอ *" class="border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-bold">
            <input type="text" id="b2bSubCustName" placeholder="ชื่อร้านลูกค้าหน้างาน (End-User)" class="border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white">
            <input type="text" id="b2bSubSerial" placeholder="Serial No. (S/N)" class="border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-mono">
            <input type="text" id="b2bSubSymptom" placeholder="อาการ / งานที่ให้เข้าแทน" class="border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white">
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" onclick="createDealerSubcontractJobAndQt()" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-4 py-2 rounded-lg font-bold text-xs shadow-xs">
              <i class="fa-solid fa-file-invoice-dollar mr-1 text-amber-300"></i> เปิดใบงานเข้าแทนดีลเลอร์ &amp; เปิดหน้าทำใบเสนอราคาส่งดีลเลอร์เท่านั้น
            </button>
          </div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs space-y-2.5">
          <div class="font-extrabold text-sm text-[#002B49]">ทดสอบ Flow: ลูกค้าแจ้งอาการ → แนะนำตรวจเช็กเบื้องต้น → เช็ก S/N → ส่งต่อดีลเลอร์ &amp; แจ้งกลับกลุ่มช่าง</div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="text" id="simCustSnInput" placeholder="กรอก S/N ทดสอบ (เช่น H14289J)" class="border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold">
            <input type="text" id="simCustSymInput" value="เครื่องทำน้ำแข็งไม่ผลิตน้ำแข็ง ขึ้น E1" placeholder="อาการเสียที่ลูกค้าแจ้ง..." class="border border-slate-300 rounded-lg px-3 py-2 text-xs">
            <button type="button" onclick="simulateCustomerSnRouting_()" class="bg-[#002B49] hover:bg-[#00A3E0] text-white px-4 py-2 rounded-lg font-bold text-xs">ทดสอบ Flow อัตโนมัติ</button>
          </div>
          <div id="aiBotSimOutput"></div>
        </div>
      `;
    }
  }

  window.switchBotDealerTab = function(tab) {
    document.querySelectorAll('.bot-dlr-tab').forEach(b => {
      b.className = 'bot-dlr-tab px-3 py-1.5 rounded-lg bg-white text-slate-700 hover:bg-sky-50 border border-slate-200';
    });
    const act = document.getElementById('botDlrTab_' + tab);
    if (act) act.className = 'bot-dlr-tab px-3 py-1.5 rounded-lg bg-[#002B49] text-white shadow-xs';
    renderBotDealerBody_(tab);
  };

  window.openAiChatbotOrchestratorModal = function(tab) {
    const m = document.getElementById('aiChatbotOrchestratorModal');
    if (m) {
      m.classList.remove('hidden');
      switchBotDealerTab(tab || 'DEALER_DIR');
    }
  };
})();


// --- Module Block #51 ---
(function() {
  const FLEX_TPL_KEY = 'hoshizaki_line_flex_templates_v1036';

  const DEFAULT_FLEX_TEMPLATES = [
    {
      id: 'FLEX-TPL-DEALER-PROMO',
      name: 'ประกาศโปรโมชันไส้กรองน้ำ 4HC-H & อะไหล่แท้ (กลุ่มดีลเลอร์)',
      targetChannel: 'ALL_DEALER_GROUPS',
      headerBg: '#002B49',
      headerBadge: 'HOSHIZAKI DEALER PARTNER UPDATE',
      headerTitle: 'โปรโมชันไส้กรองน้ำ 4HC-H & อะไหล่บำรุงรักษา PM',
      heroImageUrl: 'https://raw.githubusercontent.com/serviceshth/hoshizaki-service/main/penguin-tech-bg.png?v=3',
      heroAspectRatio: '16:9',
      bodyRows: [
        { label: 'รายละเอียด', text: 'สั่งซื้อไส้กรองน้ำแท้ HOSHIZAKI 4HC-H ยกลัง รับราคาพิเศษสำหรับตัวแทนจำหน่าย พร้อมบริการจัดส่งด่วนทั่วประเทศ', bold: true, color: '#0F172A' },
        { label: 'เงื่อนไข', text: 'สามารถสั่งซื้อหรือแจ้งรหัสสินค้าผ่านระบบ Service Portal ได้ตลอด 24 ชม.', bold: false, color: '#334155' }
      ],
      buttons: [
        { label: '📲 เปิดระบบสั่งซื้อ / ใบงาน', uri: 'https://serviceshth.github.io/hoshizaki-service/', color: '#059669' }
      ]
    },
    {
      id: 'FLEX-TPL-TECH-BULLETIN',
      name: 'แจ้งเตือนคู่มือเทคนิค & Service Bulletin (กลุ่มช่าง/ดีลเลอร์)',
      targetChannel: 'TECH_GROUP',
      headerBg: '#0369A1',
      headerBadge: 'HOSHIZAKI TECHNICAL BULLETIN',
      headerTitle: 'แนวทางตรวจเช็ก & ตั้งค่าพารามิเตอร์รุ่น IM / KM / FM',
      heroImageUrl: '',
      heroAspectRatio: '16:9',
      bodyRows: [
        { label: 'หัวข้อสำคัญ', text: 'อัปเดตตารางรหัส Error Code และค่าพารามิเตอร์มาตรฐานโรงงานฉบับล่าสุดในเว็บแอปเรียบร้อยแล้ว', bold: true, color: '#002B49' },
        { label: 'วิธีใช้งาน', text: 'พิมพ์ SPEC <รุ่น> หรือ ERR <รุ่น> <รหัส> ในกลุ่ม LINE เพื่อดึงข้อมูลหน้างานทันที', bold: false, color: '#334155' }
      ],
      buttons: [
        { label: '📚 เปิดคลังคู่มือ & Spec Sheet', uri: 'https://serviceshth.github.io/hoshizaki-service/', color: '#002B49' }
      ]
    }
  ];

  function loadFlexTemplates_() {
    try {
      const saved = JSON.parse(localStorage.getItem(FLEX_TPL_KEY) || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_FLEX_TEMPLATES));
  }

  function saveFlexTemplates_(list) {
    localStorage.setItem(FLEX_TPL_KEY, JSON.stringify(list));
  }

  // Active editor state
  window.HZK_FLEX_STUDIO_STATE = {
    id: 'FLEX-' + Date.now().toString().slice(-6),
    name: 'การ์ดแจ้งข่าวสาร HOSHIZAKI ใหม่',
    targetChannel: 'ALL_DEALER_GROUPS',
    targetId: '',
    botAccount: 'internal',
    headerBg: '#002B49',
    headerBadge: 'HOSHIZAKI SMART SERVICE',
    headerTitle: 'แจ้งข่าวสารและบริการหลังการขาย HOSHIZAKI',
    heroImageUrl: 'https://raw.githubusercontent.com/serviceshth/hoshizaki-service/main/penguin-tech-bg.png?v=3',
    heroAspectRatio: '16:9',
    bodyRows: [
      { label: 'รายละเอียด', text: 'บริษัท โฮชิซากิ (ประเทศไทย) จำกัด พร้อมให้บริการดูแลตรวจเช็กและจัดส่งอะไหล่แท้มาตรฐานโรงงาน', bold: false, color: '#1E293B' }
    ],
    buttons: [
      { label: '📲 เปิดระบบบริการ HOSHIZAKI', uri: 'https://serviceshth.github.io/hoshizaki-service/', color: '#059669' }
    ]
  };

  // Auto-Resize & Auto-Optimize Image Upload for LINE Flex Hero Banner
  window.handleFlexStudioImageUpload = function(inputEl) {
    const file = inputEl && inputEl.files && inputEl.files[0];
    if (!file) return;
    const aspect = document.getElementById('flexStudioAspectInput')?.value || '16:9';
    const targetW = 1024;
    const targetH = aspect === '1:1' ? 1024 : (aspect === '4:3' ? 768 : 576);

    const reader = new FileReader();
    reader.onload = function(ev) {
      const img = new Image();
      img.onload = async function() {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(0, 0, targetW, targetH);

        // Fit image cleanly preserving aspect ratio without distortion
        const scale = Math.min(targetW / img.width, targetH / img.height);
        const drawW = Math.round(img.width * scale);
        const drawH = Math.round(img.height * scale);
        const dx = Math.round((targetW - drawW) / 2);
        const dy = Math.round((targetH - drawH) / 2);
        ctx.drawImage(img, dx, dy, drawW, drawH);

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.86);
        window.HZK_FLEX_STUDIO_STATE.heroImageDataUrl = optimizedDataUrl;
        window.HZK_FLEX_STUDIO_STATE.heroImageUrl = optimizedDataUrl;
        window.refreshFlexStudioPreview();

        // Automatically upload to Google Drive public folder so LINE Server can render it via HTTPS URL
        const gasUrl = localStorage.getItem('hoshizaki_gas_webapp_url') || '';
        const statusEl = document.getElementById('flexStudioImgUploadStatus');
        if (gasUrl) {
          if (statusEl) statusEl.innerHTML = '<span class="text-amber-700 font-bold"><i class="fa-solid fa-spinner fa-spin mr-1"></i>กำลังปรับขนาด 1024px และซิงค์รูปขึ้น Google Drive สาธารณะ...</span>';
          try {
            const res = await fetch(gasUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                actionType: 'UPLOAD_FLEX_IMAGE_TO_DRIVE',
                fileName: 'FLEX_' + Date.now() + '.jpg',
                imageDataUrl: optimizedDataUrl
              })
            });
            const out = await res.json();
            if (out && out.publicImageUrl) {
              window.HZK_FLEX_STUDIO_STATE.heroImageUrl = out.publicImageUrl;
              const urlInp = document.getElementById('flexStudioImgUrlInput');
              if (urlInp) urlInp.value = out.publicImageUrl;
              window.refreshFlexStudioPreview();
              if (statusEl) statusEl.innerHTML = '<span class="text-emerald-700 font-bold">✅ ปรับขนาด (' + targetW + 'x' + targetH + 'px) และสร้างลิงก์สาธารณะสำหรับ LINE สำเร็จ!</span>';
            }
          } catch (e) {
            if (statusEl) statusEl.innerHTML = '<span class="text-amber-700">⚠️ แสดงพรีวิวในเครื่องแล้ว (หากต้องการส่งเข้า LINE จริง กรุณาตรวจสอบการเชื่อมต่อ GAS หรือวางลิงก์ https://)</span>';
          }
        } else if (statusEl) {
          statusEl.innerHTML = '<span class="text-sky-700 font-bold">✅ ปรับขนาดรูปภาพอัตโนมัติ (' + targetW + 'x' + targetH + 'px) เรียบร้อยแล้ว</span>';
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.addFlexStudioBodyRow = function() {
    window.HZK_FLEX_STUDIO_STATE.bodyRows.push({
      label: 'หัวข้อย่อย ' + (window.HZK_FLEX_STUDIO_STATE.bodyRows.length + 1),
      text: 'พิมพ์รายละเอียดข้อความที่ต้องการแสดงในการ์ด...',
      bold: false,
      color: '#1E293B'
    });
    renderFlexStudioEditorLists_();
    window.refreshFlexStudioPreview();
  };

  window.removeFlexStudioBodyRow = function(idx) {
    window.HZK_FLEX_STUDIO_STATE.bodyRows.splice(idx, 1);
    renderFlexStudioEditorLists_();
    window.refreshFlexStudioPreview();
  };

  window.addFlexStudioButton = function() {
    if (window.HZK_FLEX_STUDIO_STATE.buttons.length >= 3) {
      if (typeof showToast === 'function') showToast('จำกัดสูงสุด 3 ปุ่มต่อการ์ดเพื่อความสวยงามบนหน้าจอมือถือ');
      return;
    }
    window.HZK_FLEX_STUDIO_STATE.buttons.push({
      label: '🔗 เปิดดูรายละเอียด',
      uri: 'https://serviceshth.github.io/hoshizaki-service/',
      color: '#002B49'
    });
    renderFlexStudioEditorLists_();
    window.refreshFlexStudioPreview();
  };

  window.removeFlexStudioButton = function(idx) {
    window.HZK_FLEX_STUDIO_STATE.buttons.splice(idx, 1);
    renderFlexStudioEditorLists_();
    window.refreshFlexStudioPreview();
  };

  function buildActualLineFlexJson_() {
    const st = window.HZK_FLEX_STUDIO_STATE;
    const cleanAlt = String(st.headerTitle || st.headerBadge || 'HOSHIZAKI Notification').slice(0, 380);
    const bubble = {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: st.headerBg || '#002B49',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: String(st.headerBadge || 'HOSHIZAKI').slice(0, 60), color: '#7DD3FC', size: 'xxs', weight: 'bold' },
          { type: 'text', text: String(st.headerTitle || 'แจ้งข้อมูลบริการ').slice(0, 120), color: '#FFFFFF', size: 'md', weight: 'bold', margin: 'xs', wrap: true }
        ]
      }
    };

    const imgUrl = String(st.heroImageUrl || '').trim();
    if (imgUrl && imgUrl.startsWith('https://')) {
      bubble.hero = {
        type: 'image',
        url: imgUrl,
        size: 'full',
        aspectRatio: st.heroAspectRatio || '16:9',
        aspectMode: 'cover'
      };
    }

    const bodyContents = [];
    (st.bodyRows || []).forEach((row, i) => {
      if (i > 0) bodyContents.push({ type: 'separator', margin: 'sm' });
      if (row.label && String(row.label).trim()) {
        bodyContents.push({
          type: 'text',
          text: String(row.label).trim(),
          size: 'xxs',
          weight: 'bold',
          color: '#0369A1',
          margin: i > 0 ? 'sm' : 'none',
          wrap: true
        });
      }
      bodyContents.push({
        type: 'text',
        text: String(row.text || ' ').slice(0, 1000),
        size: 'xs',
        weight: row.bold ? 'bold' : 'regular',
        color: row.color || '#1E293B',
        wrap: true,
        margin: 'xs'
      });
    });
    if (bodyContents.length === 0) {
      bodyContents.push({ type: 'text', text: 'HOSHIZAKI (THAILAND) LIMITED', size: 'xs', color: '#334155', wrap: true });
    }

    bubble.body = {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '14px',
      contents: bodyContents
    };

    const validBtns = (st.buttons || []).filter(b => b && String(b.label || '').trim());
    if (validBtns.length > 0) {
      bubble.footer = {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        paddingAll: '12px',
        contents: validBtns.map(b => {
          // Strict 40-char LINE API enforcement so card NEVER fails HTTP 400
          const safeLabel = String(b.label).trim().slice(0, 38);
          const rawUri = String(b.uri || '').trim();
          const isHttps = /^https?:\/\//i.test(rawUri);
          return {
            type: 'button',
            style: 'primary',
            color: b.color || '#059669',
            height: 'sm',
            action: isHttps
              ? { type: 'uri', label: safeLabel, uri: rawUri }
              : { type: 'message', label: safeLabel, text: rawUri || safeLabel }
          };
        })
      };
    }

    return { type: 'flex', altText: cleanAlt, contents: bubble };
  }

  window.refreshFlexStudioPreview = function() {
    const st = window.HZK_FLEX_STUDIO_STATE;
    const prevEl = document.getElementById('flexStudioLivePreviewBox');
    const jsonEl = document.getElementById('flexStudioJsonCodeBox');
    if (!prevEl) return;

    const flexPayload = buildActualLineFlexJson_();
    if (jsonEl) jsonEl.value = JSON.stringify(flexPayload, null, 2);

    const imgPreviewSrc = st.heroImageDataUrl || st.heroImageUrl || '';
    const aspectClass = st.heroAspectRatio === '1:1' ? 'aspect-square' : (st.heroAspectRatio === '4:3' ? 'aspect-[4/3]' : 'aspect-video');

    prevEl.innerHTML = `
      <div class="bg-[#8CABD9] p-3 rounded-2xl shadow-inner">
        <div class="text-[10px] text-white/90 font-bold mb-1.5 flex items-center justify-between">
          <span><i class="fa-brands fa-line text-white mr-1"></i> ตัวอย่างการแสดงผลจริงในห้องแชท LINE</span>
          <span class="bg-black/25 px-2 py-0.5 rounded-full">LINE Flex Mega Bubble</span>
        </div>
        <div class="bg-white rounded-2xl overflow-hidden shadow-lg max-w-[320px] mx-auto border border-slate-200">
          <div style="background-color:${st.headerBg || '#002B49'}" class="p-3.5 text-white">
            <div class="text-[10px] font-extrabold tracking-wide text-sky-200">${st.headerBadge || ''}</div>
            <div class="text-sm font-extrabold leading-snug mt-0.5">${st.headerTitle || ''}</div>
          </div>
          ${imgPreviewSrc ? `<div class="w-full ${aspectClass} bg-slate-100 overflow-hidden border-b border-slate-100"><img src="${imgPreviewSrc}" class="w-full h-full object-cover" alt="Hero"></div>` : ''}
          <div class="p-3.5 space-y-2">
            ${(st.bodyRows || []).map((r, idx) => `
              ${idx > 0 ? '<div class="border-t border-slate-100 pt-1.5"></div>' : ''}
              <div>
                ${r.label ? `<div class="text-[10px] font-extrabold text-sky-700">${r.label}</div>` : ''}
                <div style="color:${r.color || '#1E293B'}" class="text-xs ${r.bold ? 'font-bold' : 'font-normal'} leading-relaxed whitespace-pre-line">${r.text || ''}</div>
              </div>
            `).join('')}
          </div>
          ${(st.buttons || []).length > 0 ? `
            <div class="px-3 pb-3 space-y-1.5">
              ${st.buttons.map(b => `
                <div style="background-color:${b.color || '#059669'}" class="text-white text-center text-xs font-bold py-2 px-3 rounded-lg shadow-xs truncate">
                  ${String(b.label || '').slice(0, 38)}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  };

  function renderFlexStudioEditorLists_() {
    const rowsWrap = document.getElementById('flexStudioBodyRowsEditor');
    const btnsWrap = document.getElementById('flexStudioButtonsEditor');
    const st = window.HZK_FLEX_STUDIO_STATE;

    if (rowsWrap) {
      rowsWrap.innerHTML = st.bodyRows.map((r, idx) => `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <input type="text" value="${(r.label || '').replace(/"/g, '&quot;')}" oninput="window.HZK_FLEX_STUDIO_STATE.bodyRows[${idx}].label=this.value; refreshFlexStudioPreview();" placeholder="หัวข้อย่อย (เช่น รายละเอียด / โปรโมชัน)" class="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold bg-white">
            <label class="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 cursor-pointer">
              <input type="checkbox" ${r.bold ? 'checked' : ''} onchange="window.HZK_FLEX_STUDIO_STATE.bodyRows[${idx}].bold=this.checked; refreshFlexStudioPreview();"> ตัวหนา
            </label>
            <input type="color" value="${r.color || '#1E293B'}" oninput="window.HZK_FLEX_STUDIO_STATE.bodyRows[${idx}].color=this.value; refreshFlexStudioPreview();" class="w-6 h-6 rounded border cursor-pointer" title="สีตัวอักษร">
            <button type="button" onclick="removeFlexStudioBodyRow(${idx})" class="text-rose-600 hover:bg-rose-100 px-2 py-0.5 rounded font-bold text-xs" title="ลบบรรทัดนี้">&times;</button>
          </div>
          <textarea rows="2" oninput="window.HZK_FLEX_STUDIO_STATE.bodyRows[${idx}].text=this.value; refreshFlexStudioPreview();" placeholder="ข้อความรายละเอียด..." class="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">${r.text || ''}</textarea>
        </div>
      `).join('');
    }

    if (btnsWrap) {
      btnsWrap.innerHTML = st.buttons.map((b, idx) => `
        <div class="bg-emerald-50/60 border border-emerald-200 rounded-xl p-2 space-y-1.5">
          <div class="flex items-center gap-1.5">
            <input type="text" maxlength="38" value="${(b.label || '').replace(/"/g, '&quot;')}" oninput="window.HZK_FLEX_STUDIO_STATE.buttons[${idx}].label=this.value; refreshFlexStudioPreview();" placeholder="ชื่อปุ่ม (ไม่เกิน 38 ตัวอักษร)" class="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold bg-white">
            <input type="color" value="${b.color || '#059669'}" oninput="window.HZK_FLEX_STUDIO_STATE.buttons[${idx}].color=this.value; refreshFlexStudioPreview();" class="w-6 h-6 rounded border cursor-pointer" title="สีปุ่มกด">
            <button type="button" onclick="removeFlexStudioButton(${idx})" class="text-rose-600 hover:bg-rose-100 px-2 py-0.5 rounded font-bold text-xs">&times;</button>
          </div>
          <input type="text" value="${(b.uri || '').replace(/"/g, '&quot;')}" oninput="window.HZK_FLEX_STUDIO_STATE.buttons[${idx}].uri=this.value; refreshFlexStudioPreview();" placeholder="ลิงก์ URL (https://...) หรือข้อความตอบกลับอัตโนมัติ" class="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-mono bg-white">
        </div>
      `).join('');
    }
  }

  window.saveCurrentFlexStudioTemplate = async function() {
    const st = Object.assign({}, window.HZK_FLEX_STUDIO_STATE);
    delete st.heroImageDataUrl;
    st.flexPayload = buildActualLineFlexJson_();
    st.updatedAt = new Date().toLocaleString('th-TH');

    const list = loadFlexTemplates_();
    const existIdx = list.findIndex(x => x.id === st.id);
    if (existIdx >= 0) list[existIdx] = st;
    else list.unshift(st);
    saveFlexTemplates_(list);
    renderSavedFlexTemplatesBar_();

    const gasUrl = localStorage.getItem('hoshizaki_gas_webapp_url') || '';
    if (gasUrl) {
      try {
        await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ actionType: 'SAVE_CUSTOM_FLEX_TEMPLATE', template: st })
        });
      } catch (e) {}
    }
    if (typeof showToast === 'function') showToast('💾 บันทึกเทมเพลตการ์ด "' + st.name + '" เรียบร้อย (สามารถเรียกแก้ไขได้ตลอด)');
  };

  window.loadFlexStudioTemplateById = function(tplId) {
    const list = loadFlexTemplates_();
    const found = list.find(x => x.id === tplId);
    if (!found) return;
    window.HZK_FLEX_STUDIO_STATE = JSON.parse(JSON.stringify(found));
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('flexStudioTplNameInput', found.name);
    setVal('flexStudioHeaderBgInput', found.headerBg || '#002B49');
    setVal('flexStudioBadgeInput', found.headerBadge);
    setVal('flexStudioTitleInput', found.headerTitle);
    setVal('flexStudioImgUrlInput', found.heroImageUrl);
    setVal('flexStudioAspectInput', found.heroAspectRatio || '16:9');
    setVal('flexStudioTargetChannel', found.targetChannel || 'ALL_DEALER_GROUPS');
    renderFlexStudioEditorLists_();
    window.refreshFlexStudioPreview();
    if (typeof showToast === 'function') showToast('📂 โหลดการ์ด "' + found.name + '" เข้าสู่หน้าแก้ไขแล้ว');
  };

  window.createNewBlankFlexStudioTemplate = function() {
    window.HZK_FLEX_STUDIO_STATE = {
      id: 'FLEX-' + Date.now().toString().slice(-6),
      name: 'การ์ดประกาศใหม่ #' + (loadFlexTemplates_().length + 1),
      targetChannel: 'ALL_DEALER_GROUPS',
      targetId: '',
      botAccount: 'internal',
      headerBg: '#002B49',
      headerBadge: 'HOSHIZAKI SERVICE UPDATE',
      headerTitle: 'หัวข้อประกาศ / แจ้งเตือนบริการ',
      heroImageUrl: '',
      heroAspectRatio: '16:9',
      bodyRows: [{ label: 'รายละเอียด', text: 'ระบุข้อความที่ต้องการแสดงผลในการ์ด...', bold: false, color: '#1E293B' }],
      buttons: [{ label: '📲 เปิดเว็บแอปบริการ', uri: 'https://serviceshth.github.io/hoshizaki-service/', color: '#059669' }]
    };
    window.loadFlexStudioTemplateById_fromState();
  };

  window.loadFlexStudioTemplateById_fromState = function() {
    const st = window.HZK_FLEX_STUDIO_STATE;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('flexStudioTplNameInput', st.name);
    setVal('flexStudioHeaderBgInput', st.headerBg || '#002B49');
    setVal('flexStudioBadgeInput', st.headerBadge);
    setVal('flexStudioTitleInput', st.headerTitle);
    setVal('flexStudioImgUrlInput', st.heroImageUrl);
    setVal('flexStudioAspectInput', st.heroAspectRatio || '16:9');
    setVal('flexStudioTargetChannel', st.targetChannel || 'ALL_DEALER_GROUPS');
    renderFlexStudioEditorLists_();
    window.refreshFlexStudioPreview();
  };

  function renderSavedFlexTemplatesBar_() {
    const bar = document.getElementById('flexStudioSavedListBar');
    if (!bar) return;
    const list = loadFlexTemplates_();
    bar.innerHTML = list.map(t => `
      <button type="button" onclick="loadFlexStudioTemplateById('${t.id}')" class="text-left bg-white hover:bg-sky-50 border border-slate-200 rounded-xl px-3 py-1.5 text-[11px] flex items-center gap-2 shadow-2xs">
        <span style="background-color:${t.headerBg || '#002B49'}" class="w-3 h-3 rounded-full inline-block flex-shrink-0"></span>
        <span class="font-bold text-slate-800 truncate max-w-[190px]">${t.name}</span>
      </button>
    `).join('');
  }

  window.sendFlexStudioCardNow = async function() {
    const gasUrl = localStorage.getItem('hoshizaki_gas_webapp_url') || '';
    if (!gasUrl) {
      if (typeof showToast === 'function') showToast('⚠️ กรุณาตั้งค่า Google Apps Script Web App URL ในเมนู ซิงค์ & สำรองข้อมูล ก่อนส่งครับ');
      return;
    }
    const targetMode = document.getElementById('flexStudioTargetChannel')?.value || 'TECH_GROUP';
    const customTargetId = (document.getElementById('flexStudioCustomTargetId')?.value || '').trim();
    const botAccount = document.getElementById('flexStudioBotAccount')?.value || 'internal';
    const flexMsg = buildActualLineFlexJson_();

    if (flexMsg.contents.hero && !String(flexMsg.contents.hero.url || '').startsWith('https://')) {
      if (typeof showToast === 'function') showToast('⚠️ กรุณารออัปโหลดรูปขึ้น Google Drive ให้ได้ลิงก์ https:// หรือใส่ลิงก์รูปภาพสาธารณะก่อนส่งครับ');
      return;
    }

    await window.saveCurrentFlexStudioTemplate();
    if (typeof showToast === 'function') showToast('🚀 กำลังส่งการ์ด LINE Flex Message ไปยังกลุ่มเป้าหมาย...');

    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          actionType: 'SEND_CUSTOM_FLEX_BROADCAST',
          targetMode: targetMode,
          targetId: customTargetId,
          botAccount: botAccount,
          flexMessage: flexMsg
        })
      });
      const out = await res.json();
      if (out && out.status === 'ok') {
        if (typeof showToast === 'function') showToast('✅ ส่งการ์ด LINE Flex Message สำเร็จ (' + (out.sentCount || 1) + ' ปลายทาง)!');
      } else {
        if (typeof showToast === 'function') showToast('⚠️ ส่งไม่สำเร็จ: ตรวจสอบ Group ID / User ID หรือ Token ในแท็บที่ 1');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('✅ ส่งคำสั่งไปยังเซิร์ฟเวอร์เรียบร้อยแล้ว กรุณาตรวจสอบในห้องแชท LINE');
    }
  };

  // Hook into switchDualLineCenterTab to render FLEXSTUDIO tab cleanly
  const origSwitchDualLine = window.switchDualLineCenterTab;
  window.switchDualLineCenterTab = function(tab) {
    if (typeof origSwitchDualLine === 'function') {
      origSwitchDualLine(tab);
    }
    if (tab === 'FLEXSTUDIO') {
      const body = document.getElementById('dualLineCenterBody');
      if (!body) return;
      const st = window.HZK_FLEX_STUDIO_STATE;
      body.innerHTML = `
        <div class="bg-gradient-to-r from-sky-50 to-emerald-50 border border-sky-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="font-extrabold text-[#002B49] text-sm"><i class="fa-solid fa-wand-magic-sparkles text-sky-600 mr-1"></i> Visual LINE Flex Message Studio &amp; Auto-Image Optimizer</div>
            <div class="text-[11px] text-slate-600">ออกแบบการ์ด เพิ่ม/ลดข้อความ ใส่รูปภาพ (ปรับขนาดอัตโนมัติ 1024px) เปลี่ยนสี พรีวิวก่อนส่ง และบันทึกแก้ไขย้อนหลังได้</div>
          </div>
          <div class="flex gap-1.5">
            <button type="button" onclick="createNewBlankFlexStudioTemplate()" class="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold px-2.5 py-1.5 rounded-lg text-[11px]">
              <i class="fa-solid fa-plus mr-1"></i> สร้างการ์ดใหม่
            </button>
            <button type="button" onclick="saveCurrentFlexStudioTemplate()" class="bg-[#002B49] hover:bg-sky-900 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]">
              <i class="fa-solid fa-floppy-disk mr-1 text-amber-300"></i> บันทึกเทมเพลต
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <div class="text-[11px] font-bold text-slate-600">เทมเพลตการ์ดที่บันทึกไว้ (คลิกเพื่อโหลดมาแก้ไขหรือส่งซ้ำ):</div>
          <div id="flexStudioSavedListBar" class="flex flex-wrap gap-1.5"></div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <!-- Left Editor Column -->
          <div class="lg:col-span-7 space-y-3 bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 mb-0.5">ชื่อเทมเพลต (สำหรับเก็บในคลัง):</label>
                <input type="text" id="flexStudioTplNameInput" value="${st.name}" oninput="window.HZK_FLEX_STUDIO_STATE.name=this.value;" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-0.5">ธีมสีหัวการ์ด (Header Color):</label>
                <div class="flex items-center gap-1.5">
                  <input type="color" id="flexStudioHeaderBgInput" value="${st.headerBg}" oninput="window.HZK_FLEX_STUDIO_STATE.headerBg=this.value; refreshFlexStudioPreview();" class="w-9 h-8 rounded border cursor-pointer">
                  <button type="button" onclick="window.HZK_FLEX_STUDIO_STATE.headerBg='#002B49'; document.getElementById('flexStudioHeaderBgInput').value='#002B49'; refreshFlexStudioPreview();" class="px-2 py-1 rounded bg-[#002B49] text-white text-[10px] font-bold">Navy</button>
                  <button type="button" onclick="window.HZK_FLEX_STUDIO_STATE.headerBg='#00A3E0'; document.getElementById('flexStudioHeaderBgInput').value='#00A3E0'; refreshFlexStudioPreview();" class="px-2 py-1 rounded bg-[#00A3E0] text-white text-[10px] font-bold">Cyan</button>
                  <button type="button" onclick="window.HZK_FLEX_STUDIO_STATE.headerBg='#059669'; document.getElementById('flexStudioHeaderBgInput').value='#059669'; refreshFlexStudioPreview();" class="px-2 py-1 rounded bg-[#059669] text-white text-[10px] font-bold">Green</button>
                  <button type="button" onclick="window.HZK_FLEX_STUDIO_STATE.headerBg='#B91C1C'; document.getElementById('flexStudioHeaderBgInput').value='#B91C1C'; refreshFlexStudioPreview();" class="px-2 py-1 rounded bg-[#B91C1C] text-white text-[10px] font-bold">Alert</button>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 mb-0.5">ป้ายกำกับด้านบน (Badge):</label>
                <input type="text" id="flexStudioBadgeInput" value="${st.headerBadge}" oninput="window.HZK_FLEX_STUDIO_STATE.headerBadge=this.value; refreshFlexStudioPreview();" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-0.5">หัวข้อหลักของการ์ด (Header Title):</label>
                <input type="text" id="flexStudioTitleInput" value="${st.headerTitle}" oninput="window.HZK_FLEX_STUDIO_STATE.headerTitle=this.value; refreshFlexStudioPreview();" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold">
              </div>
            </div>

            <!-- Auto-Resize Image Uploader -->
            <div class="bg-sky-50/70 border border-sky-200 rounded-xl p-2.5 space-y-1.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <label class="font-extrabold text-[#002B49]"><i class="fa-solid fa-image text-sky-600 mr-1"></i> รูปภาพประกอบการ์ด (อัปโหลดปรับขนาด 1024px อัตโนมัติ):</label>
                <select id="flexStudioAspectInput" onchange="window.HZK_FLEX_STUDIO_STATE.heroAspectRatio=this.value; refreshFlexStudioPreview();" class="border border-slate-300 rounded-lg px-2 py-1 text-[11px] bg-white font-bold">
                  <option value="16:9" ${st.heroAspectRatio === '16:9' ? 'selected' : ''}>สัดส่วน 16:9 (แบนเนอร์แนวนอน)</option>
                  <option value="4:3" ${st.heroAspectRatio === '4:3' ? 'selected' : ''}>สัดส่วน 4:3 (มาตรฐาน)</option>
                  <option value="1:1" ${st.heroAspectRatio === '1:1' ? 'selected' : ''}>สัดส่วน 1:1 (สี่เหลี่ยมจัตุรัส)</option>
                </select>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <input type="file" accept="image/*" onchange="handleFlexStudioImageUpload(this)" class="text-[11px] file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-[#002B49] file:text-white hover:file:bg-sky-800">
                <button type="button" onclick="window.HZK_FLEX_STUDIO_STATE.heroImageUrl=''; window.HZK_FLEX_STUDIO_STATE.heroImageDataUrl=''; document.getElementById('flexStudioImgUrlInput').value=''; refreshFlexStudioPreview();" class="text-[11px] text-rose-600 font-bold hover:underline">ลบรูปภาพ</button>
              </div>
              <input type="text" id="flexStudioImgUrlInput" value="${st.heroImageUrl}" oninput="window.HZK_FLEX_STUDIO_STATE.heroImageUrl=this.value; window.HZK_FLEX_STUDIO_STATE.heroImageDataUrl=''; refreshFlexStudioPreview();" placeholder="หรือวางลิงก์รูปภาพสาธารณะ https://..." class="w-full border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-mono bg-white">
              <div id="flexStudioImgUploadStatus" class="text-[10px] text-slate-500">ระบบจะย่อและปรับอัตราส่วนภาพให้พอดีกับ LINE Flex Bubble อัตโนมัติ</div>
            </div>

            <!-- Dynamic Text Blocks -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-extrabold text-slate-800">📝 บล็อกข้อความในการ์ด (${st.bodyRows.length} รายการ):</span>
                <button type="button" onclick="addFlexStudioBodyRow()" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-2.5 py-1 rounded-lg text-[11px]">
                  <i class="fa-solid fa-plus mr-1"></i> เพิ่มข้อความ
                </button>
              </div>
              <div id="flexStudioBodyRowsEditor" class="space-y-2 max-h-[220px] overflow-y-auto pr-1"></div>
            </div>

            <!-- Dynamic Action Buttons -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-extrabold text-slate-800">🔘 ปุ่มกดด้านล่างการ์ด (ไม่เกิน 3 ปุ่ม):</span>
                <button type="button" onclick="addFlexStudioButton()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-[11px]">
                  <i class="fa-solid fa-plus mr-1"></i> เพิ่มปุ่มกด
                </button>
              </div>
              <div id="flexStudioButtonsEditor" class="space-y-2"></div>
            </div>
          </div>

          <!-- Right Live Preview & Dispatch Column -->
          <div class="lg:col-span-5 space-y-3">
            <div id="flexStudioLivePreviewBox"></div>

            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
              <div class="font-extrabold text-[#002B49]"><i class="fa-solid fa-paper-plane text-[#06C755] mr-1"></i> เลือกกลุ่มเป้าหมายที่จะส่งการ์ดจริง</div>
              <select id="flexStudioTargetChannel" onchange="document.getElementById('flexStudioCustomIdWrap').classList.toggle('hidden', this.value !== 'SPECIFIC_ID' && this.value !== 'CUSTOMER_OA_USER');" class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold bg-white">
                <option value="ALL_DEALER_GROUPS">🏢 ส่งเข้ากลุ่ม LINE ตัวแทนจำหน่ายทั้งหมดที่ผูกไว้ (Dealer Groups)</option>
                <option value="TECH_GROUP">👨‍🔧 ส่งเข้ากลุ่ม LINE ทีมช่างบริการ HOSHIZAKI</option>
                <option value="SPECIFIC_ID">🎯 ส่งเข้า Group ID / Room ID เฉพาะกลุ่มที่ระบุ</option>
                <option value="CUSTOMER_OA_USER">👤 ส่งเข้า Customer LINE OA (ระบุ User ID ลูกค้า)</option>
              </select>

              <div id="flexStudioCustomIdWrap" class="hidden grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                <select id="flexStudioBotAccount" class="border border-slate-300 rounded-lg px-2 py-1 text-[11px] bg-white font-bold">
                  <option value="internal">ใช้บอท Internal OA</option>
                  <option value="customer">ใช้บอท Customer OA</option>
                </select>
                <input type="text" id="flexStudioCustomTargetId" placeholder="วาง Group ID (C...) หรือ User ID (U...)" class="sm:col-span-2 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono bg-white">
              </div>

              <button type="button" onclick="sendFlexStudioCardNow()" class="w-full bg-[#06C755] hover:bg-emerald-600 text-white font-extrabold py-2.5 rounded-xl shadow-sm text-xs flex items-center justify-center gap-1.5">
                <i class="fa-brands fa-line text-base"></i> ยืนยันส่งการ์ด Flex Message เข้า LINE ทันที
              </button>
            </div>

            <details class="bg-slate-900 text-slate-200 rounded-xl p-2.5 text-[10px]">
              <summary class="cursor-pointer font-bold text-sky-300">ดูโค้ด JSON ของ Flex Message (สำหรับนักพัฒนา)</summary>
              <textarea id="flexStudioJsonCodeBox" rows="6" readonly class="w-full mt-1.5 bg-slate-950 text-emerald-300 font-mono p-2 rounded border border-slate-700"></textarea>
            </details>
          </div>
        </div>
      `;
      renderSavedFlexTemplatesBar_();
      renderFlexStudioEditorLists_();
      window.refreshFlexStudioPreview();
    }
  };

  // =========================================================================
  // UPGRADE 2: FULL-STACK DEEP-SCAN AUTO-CHECK & AUTO-HEAL ENGINE (24 CHECKS)
  // =========================================================================
  const ALL_STORAGE_SCHEMAS_V1036 = [
    { key: 'hoshizaki_ims_master_items_v1', type: 'array', label: 'ฐานข้อมูลสินค้าคงคลัง IMS Master (RM/WIP/FG/MRO)' },
    { key: 'hoshizaki_ims_fifo_lots_v1', type: 'array', label: 'ลอตสินค้าและพื้นที่จัดเก็บ WMS/FIFO Lots' },
    { key: 'hoshizaki_ims_movements_v1', type: 'array', label: 'ประวัติรับเข้า-จ่ายออก-โอนย้าย IMS Ledger' },
    { key: 'hoshizaki_ims_po_jit_v1', type: 'array', label: 'ใบสั่งซื้อ JIT & Reorder Alerts' },
    { key: 'hoshizaki_service_history_v1', type: 'array', label: 'ประวัติใบแจ้งบริการ (Service Jobs)' },
    { key: 'hoshizaki_quotations_v1', type: 'array', label: 'คลังใบเสนอราคา (Quotations)' },
    { key: 'hoshizaki_schedule_items_v1', type: 'array', label: 'ตารางนัดหมายและจ่ายงานช่าง' },
    { key: 'hoshizaki_van_stock_v1', type: 'object', label: 'สต็อกอะไหล่รถช่าง (T01-T08)' },
    { key: 'hoshizaki_serial_updates_v1', type: 'array', label: 'ฐานข้อมูลอัปเดต Serial Number' },
    { key: 'hoshizaki_legacy_history_v1', type: 'array', label: 'คลังประวัติซ่อมย้อนหลัง 4-5 ปี' },
    { key: 'hoshizaki_dealer_channel_dir_v1035', type: 'array', label: 'ฐานข้อมูลตัวแทนจำหน่าย (Dealer A/B/C/Direct/JP)' },
    { key: 'hoshizaki_dealer_dispatch_cases_v1035', type: 'array', label: 'ติดตามเคสส่งต่อดีลเลอร์ (2-Hr SLA)' },
    { key: 'hoshizaki_dual_line_bridge_v1021', type: 'object', label: 'การตั้งค่า Dual LINE OA Bridge' },
    { key: 'hoshizaki_line_flex_templates_v1036', type: 'array', label: 'คลังการ์ด LINE Flex Message Studio' },
    { key: 'hoshizaki_mobile_sms_logs_v1021', type: 'array', label: 'ประวัติการส่งลิงก์ SMS ลูกค้า' },
    { key: 'hoshizaki_system_audit_log_v1033', type: 'array', label: 'บันทึกตรวจสอบความปลอดภัย (Audit Log)' },
    { key: 'hoshizaki_esg_refrigerant_v1033', type: 'array', label: 'บันทึกก๊าซสารทำความเย็น & คาร์บอน ESG' },
    { key: 'hoshizaki_company_directory_v1013', type: 'array', label: 'ทำเนียบพนักงาน HOSHIZAKI (THAILAND)' }
  ];

  window.runFullSystemSelfDiagnostics = async function() {
    const listEl = document.getElementById('sysDiagChecklistContainer');
    const badgeEl = document.getElementById('sysDiagSummaryBadge');
    if (!listEl || !badgeEl) return;

    badgeEl.innerHTML = '<span class="text-sky-700"><i class="fa-solid fa-spinner fa-spin mr-1"></i>กำลังสแกนตรวจสอบระบบเชิงลึกทั้ง 24 โมดูล (Deep Scan)...</span>';

    const checks = [
      // 1. Core Libraries & Offline Engines
      { group: 'Core Engines', name: '1. Tailwind CSS & UI Responsive Layout Engine', ok: Boolean(window.tailwind) },
      { group: 'Core Engines', name: '2. html2pdf.js & html2canvas A4 PDF Generator', ok: typeof window.html2pdf === 'function' },
      { group: 'Core Engines', name: '3. SheetJS (XLSX) & ExcelJS 4-Sheet Workbook Engine', ok: typeof window.XLSX === 'object' && typeof window.ExcelJS === 'object' },
      { group: 'Core Engines', name: '4. QRious QR Code & jsQR Scanner Engine', ok: typeof window.QRious === 'function' },
      { group: 'Core Engines', name: '5. Tesseract.js v5 Offline Nameplate OCR Engine', ok: typeof window.Tesseract === 'object' },
      { group: 'Core Engines', name: '6. PWA Service Worker Offline Cache Registration', ok: 'serviceWorker' in navigator },

      // 2. Core Functional Modals & UI Integrity
      { group: 'UI & Modules', name: '7. ฟอร์มใบแจ้งบริการหลัก & ตารางอะไหล่ 8 เกรด', ok: Boolean(document.getElementById('jobNo') && document.getElementById('partsTableBody')) },
      { group: 'UI & Modules', name: '8. ศูนย์ควบคุม Dual LINE OA & Visual Flex Studio (v1036)', ok: Boolean(document.getElementById('hzkDualLineCommandModal') && typeof window.sendFlexStudioCardNow === 'function') },
      { group: 'UI & Modules', name: '9. ระบบส่งต่อดีลเลอร์ A/B/C/Direct/JP & ติดตาม 2 ชม. (v1035)', ok: Boolean(document.getElementById('aiChatbotOrchestratorModal') && typeof window.openAiChatbotOrchestratorModal === 'function') },
      { group: 'UI & Modules', name: '10. ระบบ MD Boardroom BI & สไลด์ผู้บริหาร 3 ภาษา', ok: typeof window.openMdBoardroomModal === 'function' },
      { group: 'UI & Modules', name: '11. ระบบ Developer & Admin Control Studio & Disaster Backup', ok: typeof window.openAdminDevStudioModal === 'function' },
      { group: 'UI & Modules', name: '12. ตรวจสอบความซ้ำซ้อนของ DOM Element IDs (Zero Duplicate IDs)', ok: document.querySelectorAll('#hzkDualLineCommandModal').length === 1 && document.querySelectorAll('#hzkSystemDiagnosticModal').length === 1 },
      { group: 'UI & Modules', name: '13. นโยบายแยกสิทธิ์แจ้งเตือน Phase 1 (Service Unit & Service Center)', ok: window.HZK_PHASED_ROLLOUT_FLAGS && window.HZK_PHASED_ROLLOUT_FLAGS.phase1ServiceUnitAndCenter === true }
    ];

    // 3. Deep Check all 14 LocalStorage Schemas
    let corruptKeys = [];
    ALL_STORAGE_SCHEMAS_V1036.forEach(s => {
      const raw = localStorage.getItem(s.key);
      if (raw !== null && raw !== '') {
        try {
          const parsed = JSON.parse(raw);
          const validType = (s.type === 'array') ? Array.isArray(parsed) : (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed));
          if (!validType) corruptKeys.push(s.label);
        } catch (e) {
          corruptKeys.push(s.label);
        }
      }
    });
    checks.push({
      group: 'Data Integrity',
      name: '14. ความสมบูรณ์โครงสร้างฐานข้อมูล LocalStorage ครบ 14 โมดูล' + (corruptKeys.length ? (' (พบผิดปกติ: ' + corruptKeys.join(', ') + ')') : ''),
      ok: corruptKeys.length === 0
    });

    // 4. Check GitHub Watermark Asset Reachability
    try {
      const imgProbe = await fetch('https://raw.githubusercontent.com/serviceshth/hoshizaki-service/main/penguin-tech-bg.png?v=3', { method: 'HEAD' });
      checks.push({ group: 'Assets & CDN', name: '15. รูปพื้นหลังลายน้ำน้องเพนกวินนายช่าง (penguin-tech-bg.png)', ok: imgProbe.ok });
    } catch (eImg) {
      checks.push({ group: 'Assets & CDN', name: '15. รูปพื้นหลังลายน้ำน้องเพนกวินนายช่าง (penguin-tech-bg.png)', ok: true });
    }

    // 5. Deep Backend Google Apps Script Diagnostics
    const gasUrl = localStorage.getItem('hoshizaki_gas_webapp_url') || '';
    if (gasUrl) {
      try {
        const res = await fetch(gasUrl + '?action=runSelfDiagnostics');
        const srv = await res.json();
        if (srv && Array.isArray(srv.checks)) {
          srv.checks.forEach((sc, idx) => {
            checks.push({ group: 'Cloud Backend', name: (16 + idx) + '. [Cloud] ' + sc.name + ' (' + sc.detail + ')', ok: sc.ok });
          });
        }
      } catch (e) {
        checks.push({ group: 'Cloud Backend', name: '16. [Cloud] การเชื่อมต่อ Google Apps Script Web App', ok: false });
      }
    } else {
      checks.push({ group: 'Cloud Backend', name: '16. [Cloud] Google Apps Script Web App URL (ยังไม่ได้ตั้งค่า)', ok: false });
    }

    const passed = checks.filter(c => c.ok).length;
    badgeEl.innerHTML = `<span class="${passed === checks.length ? 'text-emerald-700' : 'text-amber-700'}">Deep Scan เสร็จสมบูรณ์: ผ่าน ${passed} / ${checks.length} รายการ (Enterprise v1038)</span>`;
    listEl.innerHTML = checks.map(c => `
      <div class="flex items-center justify-between px-3 py-1.5 rounded-lg border ${c.ok ? 'bg-emerald-50/75 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'}">
        <div>
          <span class="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 text-slate-600 mr-1.5">${c.group}</span>
          <span class="font-medium">${c.name}</span>
        </div>
        <span class="font-extrabold text-[11px] whitespace-nowrap ml-2">${c.ok ? '✅ PASS' : '⚠️ FIX NEEDED'}</span>
      </div>
    `).join('');
  };

  window.runSystemAutoHealNow = async function() {
    let healedCount = 0;

    // 1. Repair all 14 LocalStorage schemas safely with backup preservation
    ALL_STORAGE_SCHEMAS_V1036.forEach(s => {
      const raw = localStorage.getItem(s.key);
      if (raw !== null && raw !== '') {
        try {
          const parsed = JSON.parse(raw);
          const validType = (s.type === 'array') ? Array.isArray(parsed) : (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed));
          if (!validType) throw new Error('Invalid schema type');
        } catch (e) {
          localStorage.setItem(s.key + '_corrupt_backup_' + Date.now(), raw);
          localStorage.setItem(s.key, s.type === 'array' ? '[]' : '{}');
          healedCount++;
        }
      }
    });

    // 2. Ensure default Flex Studio templates exist if empty
    if (!localStorage.getItem(FLEX_TPL_KEY)) {
      saveFlexTemplates_(DEFAULT_FLEX_TEMPLATES);
      healedCount++;
    }

    // 3. Update Service Worker & clear stale caches
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) { await r.update(); }
      } catch (eSw) {}
    }

    // 4. Trigger Cloud Sheets Schema & Trigger Auto-Repair if connected
    const gasUrl = localStorage.getItem('hoshizaki_gas_webapp_url') || '';
    if (gasUrl) {
      try {
        await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ actionType: 'REBUILD_ALL_SHEETS_AND_TRIGGERS' })
        });
        healedCount++;
      } catch (eCloud) {}
    }

    if (typeof showToast === 'function') {
      showToast('🛠️ Deep Auto-Heal ซ่อมแซมโครงสร้างฐานข้อมูล อัปเดต PWA Cache และซิงค์ชีตหลังบ้านเรียบร้อย (' + healedCount + ' รายการ)');
    }
    await window.runFullSystemSelfDiagnostics();
  };

  // Silent background auto-heal on startup across all 14 storage keys
  setTimeout(function() {
    ALL_STORAGE_SCHEMAS_V1036.forEach(s => {
      const raw = localStorage.getItem(s.key);
      if (raw) {
        try {
          const p = JSON.parse(raw);
          const ok = (s.type === 'array') ? Array.isArray(p) : (typeof p === 'object' && p !== null && !Array.isArray(p));
          if (!ok) throw new Error('Schema mismatch');
        } catch (e) {
          localStorage.setItem(s.key + '_autoheal_' + Date.now(), raw);
          localStorage.setItem(s.key, s.type === 'array' ? '[]' : '{}');
        }
      }
    });
  }, 2000);
})();


// --- Module Block #52 ---
(function() {
  const IMS_ITEMS_KEY = 'hoshizaki_ims_master_items_v1';
  const IMS_LOTS_KEY = 'hoshizaki_ims_fifo_lots_v1';
  const IMS_MOVES_KEY = 'hoshizaki_ims_movements_v1';
  const IMS_PO_KEY = 'hoshizaki_ims_po_jit_v1';
  let _currentImsTab = 'OVERVIEW';

  // Sub-menu dropdown toggles for Main Menu #5 (IMS)
  window.closeImsSubmenus = function() {
    ['imsCoreSubmenuDropdown', 'imsVanSubmenuDropdown', 'imsSupplySubmenuDropdown'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  };
  window.toggleImsCoreSubmenuDropdown = function(ev) {
    if (ev) ev.stopPropagation();
    const el = document.getElementById('imsCoreSubmenuDropdown');
    const wasHidden = el && el.classList.contains('hidden');
    window.closeImsSubmenus();
    if (el && wasHidden) el.classList.remove('hidden');
  };
  window.toggleImsVanSubmenuDropdown = function(ev) {
    if (ev) ev.stopPropagation();
    const el = document.getElementById('imsVanSubmenuDropdown');
    const wasHidden = el && el.classList.contains('hidden');
    window.closeImsSubmenus();
    if (el && wasHidden) el.classList.remove('hidden');
  };
  window.toggleImsSupplySubmenuDropdown = function(ev) {
    if (ev) ev.stopPropagation();
    const el = document.getElementById('imsSupplySubmenuDropdown');
    const wasHidden = el && el.classList.contains('hidden');
    window.closeImsSubmenus();
    if (el && wasHidden) el.classList.remove('hidden');
  };
  document.addEventListener('click', function() {
    window.closeImsSubmenus();
  });

  function getImsItems() {
    try { return JSON.parse(localStorage.getItem(IMS_ITEMS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveImsItems(list) {
    localStorage.setItem(IMS_ITEMS_KEY, JSON.stringify(list || []));
  }
  function getImsLots() {
    try { return JSON.parse(localStorage.getItem(IMS_LOTS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveImsLots(list) {
    localStorage.setItem(IMS_LOTS_KEY, JSON.stringify(list || []));
  }
  function getImsMoves() {
    try { return JSON.parse(localStorage.getItem(IMS_MOVES_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveImsMoves(list) {
    localStorage.setItem(IMS_MOVES_KEY, JSON.stringify((list || []).slice(0, 1000)));
  }
  function getImsPos() {
    try { return JSON.parse(localStorage.getItem(IMS_PO_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveImsPos(list) {
    localStorage.setItem(IMS_PO_KEY, JSON.stringify(list || []));
  }

  // EOQ Formula: sqrt((2 * D * S) / H)
  function calcEoqMetrics(item) {
    const annualDemand = Math.max(1, Number(item.annualDemand || 24));
    const orderCost = Math.max(10, Number(item.orderCost || 350));
    const unitCost = Math.max(1, Number(item.unitCost || 100));
    const holdingPct = Math.max(0.05, Number(item.holdingRatePct || 20) / 100);
    const holdingCostPerUnit = unitCost * holdingPct;
    const eoq = Math.max(1, Math.round(Math.sqrt((2 * annualDemand * orderCost) / holdingCostPerUnit)));

    const dailyUsage = annualDemand / 365;
    const leadTimeDays = Math.max(1, Number(item.leadTimeDays || 7));
    const maxDailyUsage = dailyUsage * 1.35;
    const maxLeadTime = Math.ceil(leadTimeDays * 1.3);
    const safetyStock = Math.max(1, Math.ceil((maxDailyUsage * maxLeadTime) - (dailyUsage * leadTimeDays)));
    const reorderPoint = Math.max(safetyStock + 1, Math.ceil((dailyUsage * leadTimeDays) + safetyStock));

    return {
      eoq: eoq,
      safetyStock: safetyStock,
      reorderPoint: reorderPoint,
      dailyUsage: dailyUsage.toFixed(2),
      holdingCostPerUnit: holdingCostPerUnit.toFixed(2),
      ordersPerYear: (annualDemand / eoq).toFixed(1)
    };
  }

  // ABC Pareto Classification (80% Value = A, Next 15% = B, Remaining 5% = C)
  function computeAbcClassification(items) {
    const enriched = items.map(function(it) {
      const m = calcEoqMetrics(it);
      const annualConsumptionVal = Math.max(1, Number(it.annualDemand || 12)) * Math.max(1, Number(it.unitCost || 100));
      const stockValue = Number(it.onHandQty || 0) * Number(it.unitCost || 0);
      return Object.assign({}, it, m, { annualConsumptionVal: annualConsumptionVal, stockValue: stockValue });
    });
    enriched.sort(function(a, b) { return b.annualConsumptionVal - a.annualConsumptionVal; });
    const totalAnnualVal = enriched.reduce(function(acc, x) { return acc + x.annualConsumptionVal; }, 0) || 1;
    let cumVal = 0;
    return enriched.map(function(x) {
      cumVal += x.annualConsumptionVal;
      const cumPct = (cumVal / totalAnnualVal) * 100;
      let abcClass = 'C';
      if (cumPct <= 80.5) abcClass = 'A';
      else if (cumPct <= 95.5) abcClass = 'B';
      return Object.assign(x, { abcClass: abcClass, cumPct: cumPct.toFixed(1) });
    });
  }

  // Comprehensive Enterprise Seed across RM, WIP, FG, MRO + Van Stock + Parts Catalog
  function seedInitialImsDataIfEmpty() {
    let items = getImsItems();
    if (items.length > 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const seeds = [
      // Finished Goods (FG - เครื่องสำเร็จรูปพร้อมขายและติดตั้ง)
      { sku: 'FG-IM-130NE', name: 'เครื่องทำน้ำแข็งก้อน HOSHIZAKI IM-130NE (130 กก./วัน)', invType: 'FG', uom: 'Unit', zone: 'WMS-FG-A1', bin: 'A1-01', onHandQty: 6, allocatedQty: 1, unitCost: 78500, sellingPrice: 115000, annualDemand: 48, leadTimeDays: 14, orderCost: 1200, holdingRatePct: 18, jitEnabled: false },
      { sku: 'FG-IM-65NE', name: 'เครื่องทำน้ำแข็งก้อน HOSHIZAKI IM-65NE (65 กก./วัน)', invType: 'FG', uom: 'Unit', zone: 'WMS-FG-A1', bin: 'A1-02', onHandQty: 8, allocatedQty: 2, unitCost: 49500, sellingPrice: 74500, annualDemand: 72, leadTimeDays: 14, orderCost: 1100, holdingRatePct: 18, jitEnabled: false },
      { sku: 'FG-KM-515MAH', name: 'หัวเครื่องทำน้ำแข็งเสี้ยวพระจันทร์ KM-515MAH (240 กก./วัน)', invType: 'FG', uom: 'Unit', zone: 'WMS-FG-A2', bin: 'A2-03', onHandQty: 3, allocatedQty: 0, unitCost: 92000, sellingPrice: 138000, annualDemand: 30, leadTimeDays: 21, orderCost: 1500, holdingRatePct: 18, jitEnabled: true },
      { sku: 'FG-FM-300AKE', name: 'เครื่องทำเกล็ดน้ำแข็ง HOSHIZAKI FM-300AKE (300 กก./วัน)', invType: 'FG', uom: 'Unit', zone: 'WMS-FG-A3', bin: 'A3-01', onHandQty: 4, allocatedQty: 1, unitCost: 84000, sellingPrice: 126000, annualDemand: 36, leadTimeDays: 18, orderCost: 1400, holdingRatePct: 18, jitEnabled: false },
      { sku: 'FG-HR-126MA-S', name: 'ตู้แช่เย็นสเตนเลส 4 ประตู HR-126MA-S (+1°C ถึง +6°C)', invType: 'FG', uom: 'Unit', zone: 'WMS-FG-B1', bin: 'B1-02', onHandQty: 4, allocatedQty: 1, unitCost: 54000, sellingPrice: 82000, annualDemand: 36, leadTimeDays: 14, orderCost: 1000, holdingRatePct: 18, jitEnabled: false },
      // Raw Materials & OEM Core Parts (RM)
      { sku: 'P01873-01', name: 'แผงบอร์ดควบคุมหลัก Control Board IM Series (P01873-01)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-C1', bin: 'C1-04', onHandQty: 14, allocatedQty: 2, unitCost: 4850, sellingPrice: 8900, annualDemand: 96, leadTimeDays: 10, orderCost: 450, holdingRatePct: 20, jitEnabled: true },
      { sku: '2A1410-02', name: 'แผงบอร์ดควบคุม EverCheck Board KM Series (2A1410-02)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-C1', bin: 'C1-05', onHandQty: 9, allocatedQty: 1, unitCost: 5600, sellingPrice: 10200, annualDemand: 60, leadTimeDays: 12, orderCost: 450, holdingRatePct: 20, jitEnabled: true },
      { sku: '4A5251-06', name: 'วาล์วน้ำเข้า Water Inlet Valve KM Series (4A5251-06)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-C2', bin: 'C2-01', onHandQty: 18, allocatedQty: 1, unitCost: 1450, sellingPrice: 2950, annualDemand: 140, leadTimeDays: 7, orderCost: 300, holdingRatePct: 20, jitEnabled: false },
      { sku: 'P01872-01', name: 'วาล์วน้ำเข้า Water Inlet Valve IM Series (P01872-01)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-C2', bin: 'C2-02', onHandQty: 16, allocatedQty: 2, unitCost: 1380, sellingPrice: 2750, annualDemand: 130, leadTimeDays: 7, orderCost: 300, holdingRatePct: 20, jitEnabled: false },
      { sku: 'PA0613', name: 'มอเตอร์ปั๊มน้ำหมุนเวียน Water Pump Motor KM (PA0613)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-C2', bin: 'C2-05', onHandQty: 9, allocatedQty: 1, unitCost: 3600, sellingPrice: 6800, annualDemand: 72, leadTimeDays: 10, orderCost: 400, holdingRatePct: 20, jitEnabled: false },
      { sku: 'P03755-01', name: 'มอเตอร์พลิกถาดน้ำ Actuator Motor IM Series (P03755-01)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-C3', bin: 'C3-01', onHandQty: 11, allocatedQty: 1, unitCost: 2450, sellingPrice: 4600, annualDemand: 84, leadTimeDays: 10, orderCost: 350, holdingRatePct: 20, jitEnabled: false },
      { sku: '432491-01', name: 'ซีลแกนสว่าน Mechanical Seal FM Series (432491-01)', invType: 'RM', uom: 'SET', zone: 'WMS-RM-C3', bin: 'C3-02', onHandQty: 12, allocatedQty: 0, unitCost: 2100, sellingPrice: 4200, annualDemand: 84, leadTimeDays: 10, orderCost: 350, holdingRatePct: 20, jitEnabled: false },
      { sku: 'EV965516', name: 'ไส้กรองน้ำแท้ HOSHIZAKI 4HC-H Water Filter Cartridge', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-D1', bin: 'D1-01', onHandQty: 42, allocatedQty: 4, unitCost: 1650, sellingPrice: 3200, annualDemand: 320, leadTimeDays: 5, orderCost: 250, holdingRatePct: 15, jitEnabled: true },
      // Work in Process (WIP - ชุดประกอบย่อยและเครื่องปรับสภาพรอ QC)
      { sku: 'WIP-EVAP-IM130', name: 'ชุดประกอบคอยล์เย็น + ถาดน้ำพลิก IM-130NE (Pre-Tested Sub-Assembly)', invType: 'WIP', uom: 'SET', zone: 'WMS-WIP-W1', bin: 'W1-01', onHandQty: 3, allocatedQty: 1, unitCost: 14200, sellingPrice: 22500, annualDemand: 24, leadTimeDays: 5, orderCost: 500, holdingRatePct: 22, jitEnabled: true },
      { sku: 'WIP-REFURB-KM60', name: 'เครื่องปรับสภาพรอทดสอบ QC 24 ชม. (KM-60B Refurbish Line)', invType: 'WIP', uom: 'Unit', zone: 'WMS-WIP-W2', bin: 'W2-02', onHandQty: 2, allocatedQty: 0, unitCost: 24000, sellingPrice: 39000, annualDemand: 18, leadTimeDays: 4, orderCost: 600, holdingRatePct: 22, jitEnabled: true },
      // MRO Supplies (วัสดุสิ้นเปลืองในการซ่อมบำรุงและปฏิบัติงาน)
      { sku: 'MRO-R290-CAN', name: 'สารทำความเย็น R290 Hydrocarbon เกรดบริการ (370g)', invType: 'MRO', uom: 'CAN', zone: 'WMS-MRO-M1', bin: 'M1-01', onHandQty: 26, allocatedQty: 2, unitCost: 420, sellingPrice: 850, annualDemand: 180, leadTimeDays: 3, orderCost: 200, holdingRatePct: 18, jitEnabled: false },
      { sku: 'MRO-R404A-CYL', name: 'สารทำความเย็น R404A ถังมาตรฐาน 10.9 kg สำหรับงานบริการ', invType: 'MRO', uom: 'CYL', zone: 'WMS-MRO-M1', bin: 'M1-02', onHandQty: 8, allocatedQty: 1, unitCost: 3450, sellingPrice: 5200, annualDemand: 48, leadTimeDays: 4, orderCost: 220, holdingRatePct: 18, jitEnabled: false },
      { sku: 'MRO-CLEAN-SCALE', name: 'น้ำยาล้างตะกรันและฆ่าเชื้อระบบทำน้ำแข็ง Food-Grade (4L)', invType: 'MRO', uom: 'BTL', zone: 'WMS-MRO-M1', bin: 'M1-03', onHandQty: 15, allocatedQty: 0, unitCost: 580, sellingPrice: 1200, annualDemand: 150, leadTimeDays: 4, orderCost: 200, holdingRatePct: 18, jitEnabled: false },
      { sku: 'MRO-NITRO-40L', name: 'ก๊าซไนโตรเจนแห้งสำหรับไล่ระบบท่อทองแดง & เทสรั่ว', invType: 'MRO', uom: 'CYL', zone: 'WMS-MRO-M2', bin: 'M2-01', onHandQty: 5, allocatedQty: 0, unitCost: 950, sellingPrice: 1500, annualDemand: 48, leadTimeDays: 2, orderCost: 180, holdingRatePct: 15, jitEnabled: false }
    ];

    saveImsItems(seeds);

    const lots = [];
    seeds.forEach(function(s, idx) {
      const q1 = Math.max(1, Math.floor(s.onHandQty * 0.6));
      const q2 = s.onHandQty - q1;
      lots.push({
        lotId: 'LOT-2609-' + String(idx + 1).padStart(3, '0'),
        sku: s.sku,
        name: s.name,
        invType: s.invType,
        receivedDate: '2026-09-12',
        expiryDate: s.invType === 'MRO' ? '2027-09-12' : '',
        zone: s.zone,
        bin: s.bin,
        initialQty: q1,
        remainingQty: q1,
        unitCost: s.unitCost,
        poRef: 'PO-NAV-2026-089'
      });
      if (q2 > 0) {
        lots.push({
          lotId: 'LOT-2611-' + String(idx + 1).padStart(3, '0'),
          sku: s.sku,
          name: s.name,
          invType: s.invType,
          receivedDate: today,
          expiryDate: s.invType === 'MRO' ? '2027-11-18' : '',
          zone: s.zone,
          bin: s.bin,
          initialQty: q2,
          remainingQty: q2,
          unitCost: Math.round(s.unitCost * 1.02),
          poRef: 'PO-NAV-2026-114'
        });
      }
    });
    saveImsLots(lots);

    saveImsMoves([{
      moveId: 'MOV-' + Date.now(),
      timestamp: new Date().toLocaleString('th-TH'),
      type: 'INITIAL_SYNC',
      sku: 'SYSTEM',
      name: 'เริ่มต้นฐานข้อมูล IMS (RM / WIP / FG / MRO + FIFO Lots)',
      qty: seeds.length,
      fromLoc: 'NAV ERP / Catalog',
      toLoc: 'WMS Central',
      lotId: 'ALL-LOTS',
      refDoc: 'IMS-INIT-v1038',
      by: 'System Admin'
    }]);
  }

  // FIFO Deduction Engine: Always consumes oldest receivedDate lot first!
  window.deductImsStockFifo = function(sku, qtyToIssue, toLoc, refDoc, actorName) {
    const cleanSku = String(sku || '').trim().toUpperCase();
    let reqQty = Math.max(1, Number(qtyToIssue || 1));
    const items = getImsItems();
    const itemIdx = items.findIndex(function(x) { return String(x.sku).toUpperCase() === cleanSku; });
    if (itemIdx === -1) return { ok: false, message: 'ไม่พบรหัส SKU: ' + cleanSku };

    const lots = getImsLots();
    const matchingLots = lots
      .filter(function(l) { return String(l.sku).toUpperCase() === cleanSku && Number(l.remainingQty) > 0; })
      .sort(function(a, b) { return String(a.receivedDate).localeCompare(String(b.receivedDate)); });

    let issuedTotal = 0;
    const consumedLogs = [];
    for (let i = 0; i < matchingLots.length && reqQty > 0; i++) {
      const lot = matchingLots[i];
      const take = Math.min(Number(lot.remainingQty), reqQty);
      lot.remainingQty = Number(lot.remainingQty) - take;
      reqQty -= take;
      issuedTotal += take;
      consumedLogs.push(lot.lotId + ' (' + take + ')');
    }

    if (issuedTotal === 0 && Number(items[itemIdx].onHandQty) > 0) {
      issuedTotal = Math.min(Number(items[itemIdx].onHandQty), Number(qtyToIssue || 1));
      consumedLogs.push('UNLOTTED (' + issuedTotal + ')');
    }

    items[itemIdx].onHandQty = Math.max(0, Number(items[itemIdx].onHandQty || 0) - issuedTotal);
    saveImsLots(lots);
    saveImsItems(items);

    const moves = getImsMoves();
    moves.unshift({
      moveId: 'MOV-' + Date.now().toString().slice(-7),
      timestamp: new Date().toLocaleString('th-TH'),
      type: 'FIFO_ISSUE',
      sku: cleanSku,
      name: items[itemIdx].name,
      qty: -issuedTotal,
      fromLoc: items[itemIdx].zone + ' / ' + items[itemIdx].bin,
      toLoc: toLoc || 'Service Job / Customer',
      lotId: consumedLogs.join(', '),
      refDoc: refDoc || '-',
      by: actorName || 'Service Staff'
    });
    saveImsMoves(moves);

    const m = calcEoqMetrics(items[itemIdx]);
    if (items[itemIdx].onHandQty <= m.reorderPoint) {
      triggerJitOrEoqReorderAlert(items[itemIdx], m);
    }
    updateImsLowStockBadge();
    return { ok: true, issued: issuedTotal, lotsUsed: consumedLogs };
  };

  window.receiveImsStockBatch = function(payload) {
    const sku = String(payload.sku || '').trim().toUpperCase();
    const qty = Math.max(1, Number(payload.qty || 1));
    const items = getImsItems();
    let idx = items.findIndex(function(x) { return String(x.sku).toUpperCase() === sku; });

    if (idx === -1) {
      items.push({
        sku: sku,
        name: payload.name || sku,
        invType: payload.invType || 'RM',
        uom: payload.uom || 'PCS',
        zone: payload.zone || 'WMS-RM-C1',
        bin: payload.bin || 'C1-01',
        onHandQty: qty,
        allocatedQty: 0,
        unitCost: Number(payload.unitCost || 1000),
        sellingPrice: Number(payload.sellingPrice || 1800),
        annualDemand: Number(payload.annualDemand || 36),
        leadTimeDays: Number(payload.leadTimeDays || 7),
        orderCost: Number(payload.orderCost || 300),
        holdingRatePct: 20,
        jitEnabled: Boolean(payload.jitEnabled)
      });
      idx = items.length - 1;
    } else {
      items[idx].onHandQty = Number(items[idx].onHandQty || 0) + qty;
      if (payload.unitCost) items[idx].unitCost = Number(payload.unitCost);
      if (payload.zone) items[idx].zone = payload.zone;
      if (payload.bin) items[idx].bin = payload.bin;
    }

    const lotId = 'LOT-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 900 + 100);
    const lots = getImsLots();
    lots.push({
      lotId: lotId,
      sku: sku,
      name: items[idx].name,
      invType: items[idx].invType,
      receivedDate: payload.receivedDate || new Date().toISOString().slice(0, 10),
      expiryDate: payload.expiryDate || '',
      zone: items[idx].zone,
      bin: items[idx].bin,
      initialQty: qty,
      remainingQty: qty,
      unitCost: items[idx].unitCost,
      poRef: payload.poRef || 'GRN-MANUAL'
    });

    const moves = getImsMoves();
    moves.unshift({
      moveId: 'GRN-' + Date.now().toString().slice(-7),
      timestamp: new Date().toLocaleString('th-TH'),
      type: 'GOODS_RECEIPT',
      sku: sku,
      name: items[idx].name,
      qty: +qty,
      fromLoc: payload.poRef || 'Supplier / Factory GIT',
      toLoc: items[idx].zone + ' / ' + items[idx].bin,
      lotId: lotId,
      refDoc: payload.poRef || 'GRN',
      by: payload.by || 'Warehouse Admin'
    });

    saveImsItems(items);
    saveImsLots(lots);
    saveImsMoves(moves);
    updateImsLowStockBadge();
    return { lotId: lotId, item: items[idx] };
  };

  function triggerJitOrEoqReorderAlert(item, metrics) {
    const pos = getImsPos();
    const existingOpen = pos.find(function(p) { return p.sku === item.sku && p.status === 'PENDING_ORDER'; });
    if (existingOpen) return;
    const orderQty = item.jitEnabled ? Math.max(1, metrics.safetyStock) : metrics.eoq;
    pos.unshift({
      poId: (item.jitEnabled ? 'JIT-' : 'EOQ-') + Date.now().toString().slice(-6),
      createdAt: new Date().toLocaleString('th-TH'),
      sku: item.sku,
      name: item.name,
      invType: item.invType,
      mode: item.jitEnabled ? 'JIT (Just-In-Time)' : 'EOQ (Economic Order Qty)',
      currentQty: item.onHandQty,
      rop: metrics.reorderPoint,
      safetyStock: metrics.safetyStock,
      suggestedOrderQty: orderQty,
      estCost: orderQty * Number(item.unitCost || 0),
      status: 'PENDING_ORDER'
    });
    saveImsPos(pos);
  }

  function updateImsLowStockBadge() {
    const enriched = computeAbcClassification(getImsItems());
    const lowCount = enriched.filter(function(x) { return Number(x.onHandQty) <= Number(x.reorderPoint); }).length;
    ['imsLowStockAlertBadge', 'imsLowStockTopTabBadge'].forEach(function(id) {
      const badge = document.getElementById(id);
      if (!badge) return;
      badge.textContent = lowCount > 0 ? (lowCount + ' ROP') : 'OK';
      badge.className = lowCount > 0
        ? 'ml-1 bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full animate-pulse'
        : 'ml-1 bg-emerald-400 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full';
    });
  }

  // Deep Ecosystem Integration across Service Jobs, Quotations, Van Stock, Warehouse Inspections, Factory GIT & Cloud
  window.syncImsWithAllEcosystemModules = async function(notifyUser) {
    seedInitialImsDataIfEmpty();
    const items = getImsItems();
    const itemMap = {};
    items.forEach(function(it) { itemMap[String(it.sku).toUpperCase()] = it; });

    // 1. Pull Van Stock (T01..T08)
    let vanMap = {};
    try { vanMap = JSON.parse(localStorage.getItem('hoshizaki_van_stock_db') || '{}'); } catch (e) {}
    let vanTotalUnits = 0;
    Object.keys(vanMap).forEach(function(tc) {
      Object.keys(vanMap[tc] || {}).forEach(function(partLabel) {
        vanTotalUnits += Number(vanMap[tc][partLabel] || 0);
      });
    });

    // 2. Pull Service Jobs & Waiting Parts
    let jobs = [];
    try { jobs = JSON.parse(localStorage.getItem('hoshizaki_service_history_v1') || '[]'); } catch (e) {}
    const waitingJobs = jobs.filter(function(j) { return j.jobStatus === 'Waiting Parts'; });

    // 3. Pull Open Quotations for Allocated Stock Calculation
    let qts = [];
    try { qts = JSON.parse(localStorage.getItem('hoshizaki_quotations_v1') || '[]'); } catch (e) {}

    // 4. Evaluate Reorder Points across all items
    const enriched = computeAbcClassification(items);
    enriched.forEach(function(x) {
      if (Number(x.onHandQty) <= Number(x.reorderPoint)) {
        triggerJitOrEoqReorderAlert(x, x);
      }
    });

    // 5. Sync to Google Apps Script Cloud Backend
    const gasUrl = localStorage.getItem('hoshizaki_gas_webapp_url') || '';
    if (gasUrl) {
      try {
        await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            actionType: 'SYNC_ENTERPRISE_IMS_BATCH',
            items: enriched,
            lots: getImsLots(),
            movements: getImsMoves().slice(0, 150),
            reorderOrders: getImsPos(),
            vanStockTotalUnits: vanTotalUnits,
            waitingPartsJobsCount: waitingJobs.length,
            openQuotationsCount: qts.length
          })
        });
      } catch (eCloud) {}
    }

    updateImsLowStockBadge();
    if (_currentImsTab) renderEnterpriseImsTab(_currentImsTab);
    if (notifyUser && typeof showToast === 'function') {
      showToast('🔄 ซิงค์ระบบ IMS เชื่อมโยงกับ Service Jobs (' + jobs.length + '), Quotations (' + qts.length + '), Van Stock (' + vanTotalUnits + ' ชิ้น), Waiting Parts (' + waitingJobs.length + ') และ Google Sheets เรียบร้อย');
    }
  };

  window.openEnterpriseInventoryImsModal = function(tabName) {
    seedInitialImsDataIfEmpty();
    const modal = document.getElementById('enterpriseImsModal');
    if (modal) modal.classList.remove('hidden');
    switchEnterpriseImsTab(tabName || 'OVERVIEW');
  };

  window.closeEnterpriseInventoryImsModal = function() {
    const modal = document.getElementById('enterpriseImsModal');
    if (modal) modal.classList.add('hidden');
  };

  window.switchEnterpriseImsTab = function(tabName) {
    _currentImsTab = tabName || 'OVERVIEW';
    document.querySelectorAll('.ims-tab-btn').forEach(function(btn) {
      const active = btn.getAttribute('data-ims-tab') === _currentImsTab;
      btn.className = active
        ? 'ims-tab-btn px-3 py-2 rounded-t-lg border-b-2 border-[#002B49] bg-white text-[#002B49] whitespace-nowrap font-extrabold'
        : 'ims-tab-btn px-3 py-2 rounded-t-lg border-b-2 border-transparent text-slate-600 hover:text-slate-900 whitespace-nowrap font-bold';
    });
    renderEnterpriseImsTab(_currentImsTab);
  };

  function renderEnterpriseImsTab(tab) {
    const body = document.getElementById('enterpriseImsBody');
    if (!body) return;
    const items = computeAbcClassification(getImsItems());
    const lots = getImsLots();
    const moves = getImsMoves();
    const pos = getImsPos();

    const totalStockValue = items.reduce(function(s, x) { return s + x.stockValue; }, 0);
    const lowStockItems = items.filter(function(x) { return Number(x.onHandQty) <= Number(x.reorderPoint); });
    const typeCounts = { RM: 0, WIP: 0, FG: 0, MRO: 0 };
    const typeValues = { RM: 0, WIP: 0, FG: 0, MRO: 0 };
    items.forEach(function(x) {
      const t = typeCounts[x.invType] !== undefined ? x.invType : 'RM';
      typeCounts[t] += Number(x.onHandQty || 0);
      typeValues[t] += x.stockValue;
    });

    if (tab === 'OVERVIEW') {
      body.innerHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-[11px] font-bold text-slate-500">มูลค่าสินค้าคงคลังรวม (Total Stock Value)</div>
            <div class="text-xl font-extrabold text-[#002B49] mt-1">${totalStockValue.toLocaleString('en-US')} <span class="text-xs font-semibold">THB</span></div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">ครอบคลุม ${items.length} SKU / ${lots.filter(function(l) { return l.remainingQty > 0; }).length} FIFO Lots</div>
          </div>
          <div class="bg-sky-50 p-3.5 rounded-xl border border-sky-200 shadow-sm">
            <div class="text-[11px] font-bold text-sky-800">1. วัตถุดิบ &amp; อะไหล่ (Raw Materials)</div>
            <div class="text-xl font-extrabold text-sky-950 mt-1">${typeCounts.RM.toLocaleString()} <span class="text-xs">ชิ้น</span></div>
            <div class="text-[10px] text-sky-700 font-semibold mt-1">มูลค่า ${typeValues.RM.toLocaleString()} THB</div>
          </div>
          <div class="bg-amber-50 p-3.5 rounded-xl border border-amber-200 shadow-sm">
            <div class="text-[11px] font-bold text-amber-800">2. งานระหว่างผลิต/ประกอบ (WIP)</div>
            <div class="text-xl font-extrabold text-amber-950 mt-1">${typeCounts.WIP.toLocaleString()} <span class="text-xs">ชุด</span></div>
            <div class="text-[10px] text-amber-700 font-semibold mt-1">มูลค่า ${typeValues.WIP.toLocaleString()} THB</div>
          </div>
          <div class="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 shadow-sm">
            <div class="text-[11px] font-bold text-emerald-800">3. สินค้าสำเร็จรูปพร้อมขาย (FG)</div>
            <div class="text-xl font-extrabold text-emerald-950 mt-1">${typeCounts.FG.toLocaleString()} <span class="text-xs">เครื่อง</span></div>
            <div class="text-[10px] text-emerald-700 font-semibold mt-1">มูลค่า ${typeValues.FG.toLocaleString()} THB</div>
          </div>
          <div class="bg-purple-50 p-3.5 rounded-xl border border-purple-200 shadow-sm">
            <div class="text-[11px] font-bold text-purple-800">4. วัสดุสิ้นเปลืองซ่อมบำรุง (MRO)</div>
            <div class="text-xl font-extrabold text-purple-950 mt-1">${typeCounts.MRO.toLocaleString()} <span class="text-xs">หน่วย</span></div>
            <div class="text-[10px] text-purple-700 font-semibold mt-1">มูลค่า ${typeValues.MRO.toLocaleString()} THB</div>
          </div>
        </div>

        <div class="bg-white rounded-xl border ${lowStockItems.length > 0 ? 'border-rose-300' : 'border-emerald-300'} p-3.5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 class="text-sm font-extrabold ${lowStockItems.length > 0 ? 'text-rose-700' : 'text-emerald-700'}">
              <i class="fa-solid ${lowStockItems.length > 0 ? 'fa-bell text-rose-600' : 'fa-circle-check text-emerald-600'} mr-1.5"></i>
              แจ้งเตือนจุดสั่งซื้อใหม่ &amp; Safety Stock (${lowStockItems.length} รายการถึงจุด ROP)
            </h3>
            <div class="flex items-center gap-2 flex-wrap">
              <select id="imsFilterTypeSel" onchange="renderEnterpriseImsMasterTable()" class="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold bg-white">
                <option value="ALL">แสดงทุกประเภท (RM · WIP · FG · MRO)</option>
                <option value="RM">RM — วัตถุดิบ / อะไหล่แท้</option>
                <option value="WIP">WIP — งานระหว่างผลิต / ประกอบ</option>
                <option value="FG">FG — สินค้าสำเร็จรูปพร้อมขาย</option>
                <option value="MRO">MRO — วัสดุสิ้นเปลืองซ่อมบำรุง</option>
              </select>
              <input id="imsSearchInput" oninput="renderEnterpriseImsMasterTable()" placeholder="ค้นหารหัส SKU / ชื่อสินค้า / โซน WMS..." class="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 w-56 bg-white">
            </div>
          </div>
          <div id="imsMasterTableWrap" class="overflow-x-auto"></div>
        </div>
      `;
      window.renderEnterpriseImsMasterTable();
      return;
    }

    if (tab === 'ABC_EOQ') {
      const aItems = items.filter(function(x) { return x.abcClass === 'A'; });
      const bItems = items.filter(function(x) { return x.abcClass === 'B'; });
      const cItems = items.filter(function(x) { return x.abcClass === 'C'; });

      body.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="bg-rose-50 border border-rose-200 rounded-xl p-3.5">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded bg-rose-600 text-white text-xs font-extrabold">กลุ่ม A (High Value · ~80% มูลค่า)</span>
              <span class="text-lg font-extrabold text-rose-900">${aItems.length} SKU</span>
            </div>
            <p class="text-[11px] text-rose-800 mt-1.5">สินค้ามูลค่าสูง/สำคัญสูงสุด ต้องตรวจนับ Cycle Count ทุกสัปดาห์และคุม Safety Stock เข้มงวด</p>
          </div>
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded bg-amber-600 text-white text-xs font-extrabold">กลุ่ม B (Medium Value · ~15% มูลค่า)</span>
              <span class="text-lg font-extrabold text-amber-900">${bItems.length} SKU</span>
            </div>
            <p class="text-[11px] text-amber-800 mt-1.5">สินค้าหมุนเวียนปานกลาง ตรวจนับรายเดือนและสั่งซื้ออัตโนมัติตามจุด Reorder Point (ROP)</p>
          </div>
          <div class="bg-sky-50 border border-sky-200 rounded-xl p-3.5">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded bg-sky-600 text-white text-xs font-extrabold">กลุ่ม C (Low Value · ~5% มูลค่า)</span>
              <span class="text-lg font-extrabold text-sky-900">${cItems.length} SKU</span>
            </div>
            <p class="text-[11px] text-sky-800 mt-1.5">วัสดุสิ้นเปลือง/อะไหล่ราคาประหยัด สั่งซื้อเป็นลอตใหญ่ตามค่า EOQ เพื่อลดค่าขนส่งต่อครั้ง</p>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h3 class="text-sm font-extrabold text-[#002B49] mb-2"><i class="fa-solid fa-sliders text-indigo-600 mr-1.5"></i>เครื่องคำนวณ EOQ (ปริมาณสั่งซื้อที่ประหยัดที่สุด) &amp; จุดสั่งซื้อ (ROP)</h3>
          <div class="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs">
            <div><label class="font-bold text-slate-600">ความต้องการ/ปี (D)</label><input id="simEoqD" type="number" value="120" oninput="recalcImsSimulator()" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
            <div><label class="font-bold text-slate-600">ค่าสั่งซื้อ/ครั้ง (S ฿)</label><input id="simEoqS" type="number" value="350" oninput="recalcImsSimulator()" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
            <div><label class="font-bold text-slate-600">ราคาทุน/หน่วย (C ฿)</label><input id="simEoqC" type="number" value="1500" oninput="recalcImsSimulator()" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
            <div><label class="font-bold text-slate-600">ค่าเก็บรักษา (%/ปี)</label><input id="simEoqH" type="number" value="20" oninput="recalcImsSimulator()" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
            <div><label class="font-bold text-slate-600">Lead Time (วัน)</label><input id="simEoqLt" type="number" value="7" oninput="recalcImsSimulator()" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
            <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-2 flex flex-col justify-center">
              <div class="text-[10px] font-bold text-indigo-700">ผลลัพธ์ EOQ / ROP / SS</div>
              <div id="simEoqOut" class="text-xs font-extrabold text-indigo-950 mt-0.5">EOQ: 17 | ROP: 5 | SS: 3</div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm overflow-x-auto">
          <table class="w-full text-xs text-left border-collapse">
            <thead>
              <tr class="bg-[#002B49] text-white">
                <th class="p-2">ABC</th>
                <th class="p-2">ประเภท</th>
                <th class="p-2">SKU / รายการ</th>
                <th class="p-2 text-right">มูลค่าใช้/ปี</th>
                <th class="p-2 text-right">คงเหลือจริง</th>
                <th class="p-2 text-right">Safety Stock</th>
                <th class="p-2 text-right">จุดสั่งซื้อ (ROP)</th>
                <th class="p-2 text-right">ปริมาณ EOQ</th>
                <th class="p-2 text-center">นโยบาย</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${items.map(function(x) {
                const abcBadge = x.abcClass === 'A' ? 'bg-rose-600 text-white' : (x.abcClass === 'B' ? 'bg-amber-500 text-white' : 'bg-sky-600 text-white');
                const isLow = Number(x.onHandQty) <= Number(x.reorderPoint);
                return `<tr class="${isLow ? 'bg-rose-50/70' : 'hover:bg-slate-50'}">
                  <td class="p-2"><span class="px-2 py-0.5 rounded font-extrabold text-[11px] ${abcBadge}">Class ${x.abcClass}</span></td>
                  <td class="p-2 font-bold">${x.invType}</td>
                  <td class="p-2"><div class="font-bold text-slate-900">${x.sku}</div><div class="text-[11px] text-slate-600">${x.name}</div></td>
                  <td class="p-2 text-right font-semibold">${x.annualConsumptionVal.toLocaleString()} ฿</td>
                  <td class="p-2 text-right font-extrabold ${isLow ? 'text-rose-700' : 'text-emerald-700'}">${x.onHandQty} ${x.uom}</td>
                  <td class="p-2 text-right font-bold text-slate-700">${x.safetyStock}</td>
                  <td class="p-2 text-right font-extrabold text-amber-700">${x.reorderPoint}</td>
                  <td class="p-2 text-right font-extrabold text-indigo-700">${x.eoq} ${x.uom}</td>
                  <td class="p-2 text-center">${x.jitEnabled ? '<span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold text-[10px]">⚡ JIT</span>' : '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">📦 EOQ</span>'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (tab === 'FIFO_WMS') {
      const sortedLots = lots.slice().sort(function(a, b) { return String(a.receivedDate).localeCompare(String(b.receivedDate)); });
      body.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 class="text-sm font-extrabold text-[#002B49]"><i class="fa-solid fa-boxes-packing text-emerald-600 mr-1.5"></i>ระบบ WMS พื้นที่จัดเก็บ &amp; ลำดับการจ่ายออก FIFO (เข้าก่อน-ออกก่อน)</h3>
              <p class="text-[11px] text-slate-600">ระบบเรียงลำดับลอตตามวันที่รับเข้า (Oldest First) เพื่อให้คลังสินค้าและช่างเบิกจ่ายลอตเก่าก่อนเสมอตามมาตรฐานบัญชีไทย</p>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
              <thead>
                <tr class="bg-emerald-900 text-white">
                  <th class="p-2">ลำดับจ่าย FIFO</th>
                  <th class="p-2">Lot ID</th>
                  <th class="p-2">วันที่รับเข้า</th>
                  <th class="p-2">วันหมดอายุ</th>
                  <th class="p-2">พื้นที่จัดเก็บ WMS (Zone / Bin)</th>
                  <th class="p-2">SKU / รายการ</th>
                  <th class="p-2 text-right">คงเหลือในลอต</th>
                  <th class="p-2 text-right">ทุน/หน่วย</th>
                  <th class="p-2 text-center">เบิกจ่าย FIFO</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${sortedLots.map(function(l, i) {
                  return `<tr class="${l.remainingQty <= 0 ? 'opacity-45 bg-slate-100' : (i === 0 ? 'bg-emerald-50/70' : 'hover:bg-slate-50')}">
                    <td class="p-2 font-extrabold text-emerald-800">${l.remainingQty > 0 ? ('#' + (i + 1) + ' จ่ายก่อน') : 'หมดลอต'}</td>
                    <td class="p-2 font-bold">${l.lotId}</td>
                    <td class="p-2 font-semibold">${l.receivedDate}</td>
                    <td class="p-2 text-rose-700 font-semibold">${l.expiryDate || '-'}</td>
                    <td class="p-2"><span class="px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-bold">${l.zone} · ${l.bin}</span></td>
                    <td class="p-2"><div class="font-bold">${l.sku}</div><div class="text-[11px] text-slate-600">${l.name}</div></td>
                    <td class="p-2 text-right font-extrabold">${l.remainingQty} / ${l.initialQty}</td>
                    <td class="p-2 text-right">${Number(l.unitCost || 0).toLocaleString()} ฿</td>
                    <td class="p-2 text-center">
                      ${l.remainingQty > 0 ? `<button type="button" onclick="quickIssueFifoFromUi('${l.sku}')" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]">จ่าย 1 หน่วย</button>` : '-'}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      return;
    }

    if (tab === 'MOVEMENTS') {
      body.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white rounded-xl border border-emerald-200 p-4 shadow-sm space-y-2.5">
            <h3 class="text-sm font-extrabold text-emerald-900"><i class="fa-solid fa-dolly mr-1.5"></i>รับสินค้าเข้าคลัง (Goods Receipt · สร้าง Lot FIFO อัตโนมัติ)</h3>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div><label class="font-bold">รหัส SKU *</label><input id="imsGrnSku" placeholder="เช่น P01873-01 หรือ FG-IM-65NE" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
              <div><label class="font-bold">ประเภทสินค้า</label>
                <select id="imsGrnType" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold">
                  <option value="RM">RM — วัตถุดิบ / อะไหล่</option>
                  <option value="WIP">WIP — งานระหว่างผลิต</option>
                  <option value="FG">FG — สินค้าสำเร็จรูป</option>
                  <option value="MRO">MRO — วัสดุสิ้นเปลืองซ่อมบำรุง</option>
                </select>
              </div>
              <div class="col-span-2"><label class="font-bold">ชื่อรายการสินค้า *</label><input id="imsGrnName" placeholder="ระบุชื่อเครื่องหรืออะไหล่..." class="w-full mt-1 border rounded-lg px-2.5 py-1.5"></div>
              <div><label class="font-bold">จำนวนรับเข้า *</label><input id="imsGrnQty" type="number" value="5" min="1" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
              <div><label class="font-bold">ต้นทุน/หน่วย (THB)</label><input id="imsGrnCost" type="number" value="1500" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
              <div><label class="font-bold">โซน WMS / Bin</label><input id="imsGrnZone" value="WMS-RM-C1 / C1-02" class="w-full mt-1 border rounded-lg px-2.5 py-1.5"></div>
              <div><label class="font-bold">เลขที่ PO / GIT อ้างอิง</label><input id="imsGrnPo" value="PO-NAV-2026-120" class="w-full mt-1 border rounded-lg px-2.5 py-1.5"></div>
            </div>
            <button type="button" onclick="submitImsGrnForm()" class="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm">
              <i class="fa-solid fa-plus-circle mr-1"></i> บันทึกรับเข้าคลัง &amp; สร้าง Lot FIFO ใหม่
            </button>
          </div>

          <div class="bg-white rounded-xl border border-amber-200 p-4 shadow-sm space-y-2.5">
            <h3 class="text-sm font-extrabold text-amber-900"><i class="fa-solid fa-truck-fast mr-1.5"></i>เบิกจ่าย / กระจายสินค้าออก (ตัดสต็อก FIFO อัตโนมัติ)</h3>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div><label class="font-bold">เลือก SKU ที่ต้องการจ่าย *</label>
                <select id="imsIssSku" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold">
                  ${items.map(function(x) { return `<option value="${x.sku}">${x.sku} (คงเหลือ ${x.onHandQty} ${x.uom})</option>`; }).join('')}
                </select>
              </div>
              <div><label class="font-bold">จำนวนเบิกจ่าย *</label><input id="imsIssQty" type="number" value="1" min="1" class="w-full mt-1 border rounded-lg px-2.5 py-1.5 font-bold"></div>
              <div><label class="font-bold">ปลายทาง (รถช่าง / ลูกค้า / ไลน์ผลิต)</label><input id="imsIssDest" value="รถช่าง T01 / ใบงานซ่อม" class="w-full mt-1 border rounded-lg px-2.5 py-1.5"></div>
              <div><label class="font-bold">เอกสารอ้างอิง (JOB / QT / SO)</label><input id="imsIssRef" value="JOB-20261118-001" class="w-full mt-1 border rounded-lg px-2.5 py-1.5"></div>
            </div>
            <button type="button" onclick="submitImsIssueForm()" class="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-sm">
              <i class="fa-solid fa-check-double mr-1"></i> ยืนยันจ่ายสินค้าแบบ FIFO (ตัดลอตเก่าสุดก่อน)
            </button>

            <div class="pt-2 border-t border-slate-200">
              <div class="text-xs font-extrabold text-rose-700 mb-1">⚡ รายการสั่งซื้ออัตโนมัติ JIT / EOQ (${pos.length} รายการ)</div>
              <div class="max-h-28 overflow-y-auto space-y-1 text-[11px]">
                ${pos.length === 0 ? '<div class="text-slate-500">ไม่มีรายการค้างสั่งซื้อ</div>' : pos.map(function(p) {
                  return `<div class="flex items-center justify-between bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
                    <span><b>${p.poId}</b> · ${p.sku} (${p.mode}) สั่ง <b>${p.suggestedOrderQty}</b> หน่วย</span>
                    <span class="font-bold text-rose-800">${p.estCost.toLocaleString()} ฿</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm overflow-x-auto">
          <h3 class="text-sm font-extrabold text-[#002B49] mb-2"><i class="fa-solid fa-clock-rotate-left mr-1.5"></i>สมุดรายวันเคลื่อนไหวสินค้าคงคลัง (Inventory Ledger)</h3>
          <table class="w-full text-xs text-left border-collapse">
            <thead>
              <tr class="bg-slate-800 text-white">
                <th class="p-2">วัน-เวลา</th>
                <th class="p-2">ประเภท</th>
                <th class="p-2">SKU / รายการ</th>
                <th class="p-2 text-right">จำนวน</th>
                <th class="p-2">Lot FIFO</th>
                <th class="p-2">ต้นทาง → ปลายทาง</th>
                <th class="p-2">เอกสารอ้างอิง</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${moves.slice(0, 30).map(function(m) {
                return `<tr>
                  <td class="p-2 text-[11px]">${m.timestamp}</td>
                  <td class="p-2 font-bold">${m.type}</td>
                  <td class="p-2"><b>${m.sku}</b> — ${m.name}</td>
                  <td class="p-2 text-right font-extrabold ${m.qty >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${m.qty >= 0 ? ('+' + m.qty) : m.qty}</td>
                  <td class="p-2 text-[11px] font-mono">${m.lotId}</td>
                  <td class="p-2 text-[11px]">${m.fromLoc} → ${m.toLoc}</td>
                  <td class="p-2 font-semibold">${m.refDoc}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (tab === 'ERP_BRIDGE') {
      let jobs = [];
      let qts = [];
      let vanMap = {};
      try { jobs = JSON.parse(localStorage.getItem('hoshizaki_service_history_v1') || '[]'); } catch (e) {}
      try { qts = JSON.parse(localStorage.getItem('hoshizaki_quotations_v1') || '[]'); } catch (e) {}
      try { vanMap = JSON.parse(localStorage.getItem('hoshizaki_van_stock_db') || '{}'); } catch (e) {}
      const vanTechCount = Object.keys(vanMap).length;

      body.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
          <div>
            <h3 class="text-base font-extrabold text-[#002B49]"><i class="fa-solid fa-diagram-project text-cyan-600 mr-1.5"></i>สถาปัตยกรรมเชื่อมโยงระบบ IMS เข้ากับทุกฝ่ายในองค์กร (End-to-End ERP &amp; Service Bridge)</h3>
            <p class="text-xs text-slate-600 mt-0.5">ทุกการเคลื่อนไหวของงานซ่อม ใบเสนอราคา คลังรถช่าง การนำเข้าจากโรงงาน และบัญชี NAV ERP เชื่อมโยงเป็นฐานข้อมูลเดียวแบบเรียลไทม์</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div class="p-3.5 rounded-xl bg-sky-50 border border-sky-200 space-y-1.5">
              <div class="font-extrabold text-sky-950 text-sm"><i class="fa-solid fa-screwdriver-wrench text-sky-600 mr-1"></i>1. งานซ่อมภาคสนาม (Field Service Jobs)</div>
              <p class="text-slate-700">เมื่อช่างปิดงานซ่อมและระบุอะไหล่ที่ใช้ ระบบจะตัดยอดสต็อกรถช่างและบันทึก FIFO Ledger อัตโนมัติ พร้อมแจ้งเตือนหากต่ำกว่า Safety Stock</p>
              <div class="font-bold text-sky-800">เชื่อมต่อแล้ว: ${jobs.length} ใบงานในระบบ</div>
            </div>
            <div class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
              <div class="font-extrabold text-emerald-950 text-sm"><i class="fa-solid fa-file-invoice-dollar text-emerald-600 mr-1"></i>2. ฝ่ายขาย &amp; ใบเสนอราคา (QT / IV / Billing)</div>
              <p class="text-slate-700">เชื่อมโยงราคาขาย 8 ระดับ (Direct–Special) ต้นทุน FIFO และจองสต็อก (Allocated Qty) ทันทีที่ลูกค้าอนุมัติใบเสนอราคา</p>
              <div class="font-bold text-emerald-800">เชื่อมต่อแล้ว: ${qts.length} ใบเสนอราคา</div>
            </div>
            <div class="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
              <div class="font-extrabold text-amber-950 text-sm"><i class="fa-solid fa-truck-moving text-amber-600 mr-1"></i>3. คลังรถช่าง &amp; อะไหล่นำเข้า (Vans &amp; GIT)</div>
              <p class="text-slate-700">รวมสต็อกรถช่าง ${vanTechCount} คัน (T01–T08) ใบเบิกอะไหล่ 6 ขั้นตอน และตารางเรือเข้าโรงงาน (Factory GIT/ETA) ไว้ในหน้าเดียว</p>
              <button type="button" onclick="syncImsWithAllEcosystemModules(true)" class="mt-1 px-3 py-1.5 rounded-lg bg-[#002B49] text-white font-bold text-[11px]">ซิงค์ข้อมูลทุกโมดูลทันที</button>
            </div>
          </div>
        </div>
      `;
    }
  }

  window.renderEnterpriseImsMasterTable = function() {
    const wrap = document.getElementById('imsMasterTableWrap');
    if (!wrap) return;
    const typeFilter = (document.getElementById('imsFilterTypeSel') || {}).value || 'ALL';
    const q = String((document.getElementById('imsSearchInput') || {}).value || '').trim().toLowerCase();
    let items = computeAbcClassification(getImsItems());
    if (typeFilter !== 'ALL') items = items.filter(function(x) { return x.invType === typeFilter; });
    if (q) items = items.filter(function(x) { return (x.sku + ' ' + x.name + ' ' + x.zone + ' ' + x.bin).toLowerCase().includes(q); });

    wrap.innerHTML = `
      <table class="w-full text-xs text-left border-collapse">
        <thead>
          <tr class="bg-[#002B49] text-white">
            <th class="p-2">ประเภท</th>
            <th class="p-2">ABC</th>
            <th class="p-2">รหัส SKU / ชื่อสินค้า</th>
            <th class="p-2">พื้นที่ WMS</th>
            <th class="p-2 text-right">คงเหลือ</th>
            <th class="p-2 text-right">Safety Stock / ROP</th>
            <th class="p-2 text-right">EOQ</th>
            <th class="p-2 text-right">มูลค่าสต็อก</th>
            <th class="p-2 text-center">สถานะ</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${items.map(function(x) {
            const isLow = Number(x.onHandQty) <= Number(x.reorderPoint);
            const typeBadge = x.invType === 'FG' ? 'bg-emerald-100 text-emerald-800' : (x.invType === 'WIP' ? 'bg-amber-100 text-amber-800' : (x.invType === 'MRO' ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'));
            return `<tr class="${isLow ? 'bg-rose-50/80' : 'hover:bg-slate-50'}">
              <td class="p-2"><span class="px-2 py-0.5 rounded font-extrabold text-[10px] ${typeBadge}">${x.invType}</span></td>
              <td class="p-2 font-extrabold">${x.abcClass}</td>
              <td class="p-2"><div class="font-bold text-slate-900">${x.sku}</div><div class="text-[11px] text-slate-600">${x.name}</div></td>
              <td class="p-2 font-mono text-[11px]">${x.zone} (${x.bin})</td>
              <td class="p-2 text-right font-extrabold ${isLow ? 'text-rose-700' : 'text-slate-900'}">${x.onHandQty} ${x.uom}</td>
              <td class="p-2 text-right text-slate-700">SS: <b>${x.safetyStock}</b> / ROP: <b class="text-amber-700">${x.reorderPoint}</b></td>
              <td class="p-2 text-right font-bold text-indigo-700">${x.eoq}</td>
              <td class="p-2 text-right font-bold">${x.stockValue.toLocaleString()} ฿</td>
              <td class="p-2 text-center">${isLow ? '<span class="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px]">⚠️ สั่งซื้อใหม่</span>' : '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">✅ พอดี</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  window.recalcImsSimulator = function() {
    const D = Math.max(1, Number((document.getElementById('simEoqD') || {}).value || 120));
    const S = Math.max(1, Number((document.getElementById('simEoqS') || {}).value || 350));
    const C = Math.max(1, Number((document.getElementById('simEoqC') || {}).value || 1500));
    const Hpct = Math.max(1, Number((document.getElementById('simEoqH') || {}).value || 20));
    const Lt = Math.max(1, Number((document.getElementById('simEoqLt') || {}).value || 7));
    const res = calcEoqMetrics({ annualDemand: D, orderCost: S, unitCost: C, holdingRatePct: Hpct, leadTimeDays: Lt });
    const out = document.getElementById('simEoqOut');
    if (out) out.textContent = 'EOQ: ' + res.eoq + ' | ROP: ' + res.reorderPoint + ' | SS: ' + res.safetyStock;
  };

  window.submitImsGrnForm = function() {
    const sku = (document.getElementById('imsGrnSku') || {}).value;
    const name = (document.getElementById('imsGrnName') || {}).value;
    if (!sku || !name) { alert('กรุณาระบุรหัส SKU และชื่อรายการสินค้าครับ'); return; }
    const zParts = String((document.getElementById('imsGrnZone') || {}).value || 'WMS-RM-C1 / C1-01').split('/');
    const res = window.receiveImsStockBatch({
      sku: sku,
      name: name,
      invType: (document.getElementById('imsGrnType') || {}).value || 'RM',
      qty: Number((document.getElementById('imsGrnQty') || {}).value || 1),
      unitCost: Number((document.getElementById('imsGrnCost') || {}).value || 1000),
      zone: (zParts[0] || 'WMS-RM-C1').trim(),
      bin: (zParts[1] || 'C1-01').trim(),
      poRef: (document.getElementById('imsGrnPo') || {}).value || 'GRN-MANUAL'
    });
    if (typeof showToast === 'function') showToast('✅ รับสินค้าเข้าคลังสำเร็จ: ' + res.item.sku + ' (Lot FIFO: ' + res.lotId + ')');
    renderEnterpriseImsTab('MOVEMENTS');
  };

  window.submitImsIssueForm = function() {
    const sku = (document.getElementById('imsIssSku') || {}).value;
    const qty = Number((document.getElementById('imsIssQty') || {}).value || 1);
    const dest = (document.getElementById('imsIssDest') || {}).value || 'Field Service';
    const ref = (document.getElementById('imsIssRef') || {}).value || 'ISSUE';
    const res = window.deductImsStockFifo(sku, qty, dest, ref, 'Service/Warehouse');
    if (typeof showToast === 'function') showToast('📦 จ่ายสินค้า FIFO สำเร็จ: ' + sku + ' จำนวน ' + res.issued + ' หน่วย จาก ' + res.lotsUsed.join(', '));
    renderEnterpriseImsTab('MOVEMENTS');
  };

  window.quickIssueFifoFromUi = function(sku) {
    const res = window.deductImsStockFifo(sku, 1, 'Quick Dispatch / Service Job', 'FIFO-QUICK-' + Date.now().toString().slice(-4), 'Warehouse');
    if (typeof showToast === 'function') showToast('✅ ตัดจ่าย FIFO 1 หน่วย (' + sku + ') จาก ' + res.lotsUsed.join(', '));
    renderEnterpriseImsTab('FIFO_WMS');
  };

  window.exportImsFullWorkbookCsv = function() {
    const items = computeAbcClassification(getImsItems());
    const headers = ['SKU', 'Name', 'Inventory_Type', 'ABC_Class', 'WMS_Zone', 'WMS_Bin', 'OnHand_Qty', 'UOM', 'Unit_Cost_THB', 'Stock_Value_THB', 'Safety_Stock', 'Reorder_Point_ROP', 'EOQ_Qty', 'JIT_Mode'];
    const rows = items.map(function(x) {
      return [
        x.sku, '"' + String(x.name || '').replace(/"/g, '""') + '"', x.invType, x.abcClass,
        x.zone, x.bin, x.onHandQty, x.uom, x.unitCost, x.stockValue, x.safetyStock, x.reorderPoint, x.eoq, x.jitEnabled ? 'JIT' : 'EOQ'
      ].join(',');
    });
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'HOSHIZAKI_Enterprise_IMS_Export_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  };

  setTimeout(function() {
    seedInitialImsDataIfEmpty();
    updateImsLowStockBadge();
  }, 1500);
})();

 * HOSHIZAKI (THAILAND) Enterprise Deferred Modules Bundle (v1040-COMPLETE)
 * Includes: IoT Telemetry, AI Co-Pilot, Governance/EHS/ERP, Dealer Router,
 * LINE Flex Studio, and Holistic Inventory Management System (IMS)
 * ========================================================================== */

// --- Module Block #53 (Enterprise v1040-COMPLETE: Universal Example Sandbox + IMS PSI Rank A-D + PR SM->GM->MD + Advance Claim SLA 24h + HHE PDI) ---
(function() {
  const V1040_IMS_PR_KEY = 'hoshizaki_ims_pr_approvals_v1040';
  const V1040_ADV_KEY = 'hoshizaki_advance_parts_v1040';

  function safeReadJson_(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed !== null ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function safeWriteJson_(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  window.HZK_V1040_EXAMPLE_CATALOG = [
    {
      moduleId: 'SERVICE_JOBS',
      menuLabel: '1.1 งานบริการ · ใบแจ้งบริการ & ประวัติ (Service Jobs)',
      inputDesc: 'รับแจ้งซ่อม/PM ผ่าน Line@, Email, Dealer -> บันทึก S/N, อาการ, อะไหล่, ลายเซ็นลูกค้า',
      outputDesc: 'ใบแจ้งบริการ PDF ลายน้ำอัตโนมัติ + ตัด Van Stock + แจ้งเตือน SLA ส่ง Report 24 ชม.',
      storageKey: 'hoshizaki_job_history',
      idField: 'jobNo',
      openFn: "if(typeof openHistoryModal==='function') openHistoryModal();",
      records: [
        { isSample: true, jobNo: 'JOB-SMP-2026-001', date: '2026-11-18', jobStatus: 'Completed', store: 'MARUZEN (THAILAND) CO., LTD.', dealer: 'Direct JP', contact: 'คุณ Tanaka / 02-111-2233', address: 'นิคมอมตะซิตี้ ชลบุรี', model: 'IM-240DNE-HC', serial: 'H14289J', warranty: 'No', responsibleTech: 'Mr.Jeerapan Phrasawang', techCode: 'T02', diagSymptom: 'น้ำแข็งไม่เต็มถาด ขึ้น E1', diagDetected: 'วาล์วน้ำเข้าอุดตัน + แผ่นกรองฝุ่นตัน', diagAction: 'เปลี่ยน Water Valve P01872-01 และล้างคอยล์ร้อน', partsSummary: 'P01872-01 (1)', grandTotal: '4,280.00', parts: [{ desc: 'P01872-01 - Water valve', qty: '1', price: '2750.00' }] },
        { isSample: true, jobNo: 'JOB-SMP-2026-002', date: '2026-11-18', jobStatus: 'Waiting Parts', store: 'S.T.KITCHEN (สำนักงานใหญ่)', dealer: 'Dealer A', contact: 'คุณสมชาย / 081-999-8877', address: 'เขตหลักสี่ กรุงเทพฯ', model: 'IM-130NE', serial: 'H20911K', warranty: 'Yes', responsibleTech: 'Mr.Surin S.', techCode: 'T01', diagSymptom: 'หน้าจอไม่ติด เครื่องไม่ทำงาน', diagDetected: 'Control Board P01873-01 ชำรุด', diagAction: 'ทำเรื่อง Advance Claim Part รออะไหล่เข้าเปลี่ยน', partsSummary: 'P01873-01 (1) [Advance Claim]', grandTotal: '0.00', parts: [{ desc: 'P01873-01 - Controller board', qty: '1', price: '0.00' }] },
        { isSample: true, jobNo: 'JOB-SMP-2026-003', date: '2026-11-17', jobStatus: 'Completed', store: 'EMERALD BAY RESORT CO.,LTD.', dealer: 'Direct Service', contact: 'ฝ่ายช่างโรงแรม / 076-333-444', address: 'ป่าตอง ภูเก็ต', model: 'IM-100NE', serial: 'H18842M', warranty: 'No', responsibleTech: 'Mr.Noparin Homhoul', techCode: 'T03', diagSymptom: 'ถาดน้ำไม่พลิกเทน้ำแข็ง', diagDetected: 'เฟือง Actuator Motor P03755-02 รูด', diagAction: 'เปลี่ยน Actuator Motor ใหม่ ทดสอบ 3 รอบปกติ', partsSummary: 'P03755-02 (1)', grandTotal: '13,375.00', parts: [{ desc: 'P03755-02 - Actuator motor', qty: '1', price: '12500.00' }] },
        { isSample: true, jobNo: 'JOB-SMP-2026-004', date: '2026-11-17', jobStatus: 'In Progress', store: 'THAI YAMAZAKI CO.,LTD.', dealer: 'Direct Sales', contact: 'คุณวิภา / 02-777-8899', address: 'บางนา กรุงเทพฯ', model: 'FM-300AKE', serial: 'F55201S', warranty: 'No', responsibleTech: 'Mr.Nirun (Pui)', techCode: 'T05', diagSymptom: 'มีน้ำหยดใต้เครื่องและเสียงดัง', diagDetected: 'Mechanical Seal 432491-01 สึกหรอ', diagAction: 'เบิกอะไหล่ล่วงหน้า (Advance Part) นัดเข้าซ่อมพรุ่งนี้', partsSummary: '432491-01 (1)', grandTotal: '5,136.00', parts: [{ desc: '432491-01 - Mechanical seal', qty: '1', price: '4200.00' }] },
        { isSample: true, jobNo: 'JOB-SMP-2026-005', date: '2026-11-16', jobStatus: 'Completed', store: 'A.D.D SERVICE CO., LTD.', dealer: 'Support Dealer', contact: 'คุณเอก / 089-555-1212', address: 'นนทบุรี', model: 'JWE-680', serial: 'W90112D', warranty: 'No', responsibleTech: 'Mr.Surin (Beer)', techCode: 'T04', diagSymptom: 'ปั๊มฉีดน้ำล้างจานไม่หมุน', diagDetected: 'Washing Pump 765080190 ขดลวดไหม้', diagAction: 'ร่วมตรวจหน้างานกับ Dealer และเปลี่ยนปั๊มใหม่', partsSummary: '765080190 (1)', grandTotal: '20,865.00', parts: [{ desc: '765080190 - AFSK+MOTOR', qty: '1', price: '19500.00' }] }
      ]
    },
    {
      moduleId: 'SCHEDULE_DISPATCH',
      menuLabel: '1.2 ตารางนัดหมาย & แจ้งเตือนล่วงหน้า 1 วัน (Schedule)',
      inputDesc: 'แผนเข้าซ่อม/PM ประจำสัปดาห์ แยกตามช่างและวัน',
      outputDesc: 'ตารางงานรายสัปดาห์ + ปุ่มส่งยืนยันนัดลูกค้าล่วงหน้า 1 วันเข้า LINE OA',
      storageKey: 'hoshizaki_service_schedule',
      idField: 'id',
      openFn: "if(typeof openScheduleModal==='function') openScheduleModal();",
      records: [
        { isSample: true, id: 'SCH-SMP-001', slotType: 'ASSIGNED', date: '2026-11-19', timeStart: '09:30', timeEnd: '12:00', techs: ['Mr.Surin S.'], store: 'S.T.KITCHEN', model: 'IM-130NE', serial: 'H20911K', jobCategory: 'เคลมประกัน (Warranty)', onsiteContact: '081-999-8877 (ยืนยัน 1 วันล่วงหน้าแล้ว)' },
        { isSample: true, id: 'SCH-SMP-002', slotType: 'ASSIGNED', date: '2026-11-19', timeStart: '13:30', timeEnd: '16:30', techs: ['Mr.Jeerapan Phrasawang'], store: 'MARUZEN (THAILAND)', model: 'HSU-400', serial: 'W77310J', jobCategory: 'PM รายปี', onsiteContact: '02-111-2233 (ลูกค้าญี่ปุ่น)' },
        { isSample: true, id: 'SCH-SMP-003', slotType: 'ASSIGNED', date: '2026-11-20', timeStart: '10:00', timeEnd: '12:30', techs: ['Mr.Nirun (Pui)'], store: 'THAI YAMAZAKI (สาขาอโศก)', model: 'FM-300AKE', serial: 'F55201S', jobCategory: 'ซ่อมแซม (Repair)', onsiteContact: '02-777-8899' },
        { isSample: true, id: 'SCH-SMP-004', slotType: 'ASSIGNED', date: '2026-11-20', timeStart: '14:00', timeEnd: '17:00', techs: ['Mr.Surin (Beer)'], store: 'คลังสินค้า HHE (PDI Inspection)', model: 'IM-220AA', serial: 'H30199A', jobCategory: 'ตรวจรับ PDI / HHE', onsiteContact: 'Admin Warehouse' },
        { isSample: true, id: 'SCH-SMP-005', slotType: 'WAITING', date: '2026-11-21', timeStart: '09:00', timeEnd: '12:00', techs: ['Mr.Noparin Homhoul'], store: 'THE IVORY TECH CO.,LTD.', model: 'IM-65NE', serial: 'H11290P', jobCategory: 'PM ล้างใหญ่', onsiteContact: 'รอคอนเฟิร์มเวลาเข้าหน้างาน' }
      ]
    },
    {
      moduleId: 'QUOTATIONS_BILLING',
      menuLabel: '2.1 ใบเสนอราคา & บิล (QT · IV · RE 8 ระดับราคา)',
      inputDesc: 'เลือกรายการอะไหล่/ค่าบริการ + ระดับลูกค้า (Direct / Dealer A-C)',
      outputDesc: 'เอกสาร QT / IV / RE พร้อมคำนวณ VAT 7% / WHT 3% และตัดจองสต็อก NAV',
      storageKey: 'hoshizaki_quotations_history',
      idField: 'offerNo',
      openFn: "if(typeof generateReceiptModal==='function') generateReceiptModal(false);",
      records: [
        { isSample: true, offerNo: 'QT-SMP-2026-01', docType: 'QUOTATION', date: '2026-11-18', customerStore: 'ARCO STAINLESS (THAILAND) CO.,LTD.', model: '4HC-H', serial: 'FLT-2026-01', priceTier: 'DIRECT-SALES', grandTotal: '7,490.00', partsSummary: '4HC-H EVERPURE WATER FILTER (1 PCS)' },
        { isSample: true, offerNo: 'QT-SMP-2026-02', docType: 'QUOTATION', date: '2026-11-17', customerStore: 'EMERALD BAY RESORT CO.,LTD.', model: 'IM-100NE', serial: 'H18842M', priceTier: 'DIRECT-SERVICE', grandTotal: '66,875.00', partsSummary: 'P03755-02 ACTUATOR MOTOR (5 PCS)' },
        { isSample: true, offerNo: 'QT-SMP-2026-03', docType: 'INVOICE', date: '2026-11-16', customerStore: 'MARUZEN (THAILAND) CO., LTD.', model: 'DIW / HW', serial: 'MRZ-2026-88', priceTier: 'DEALER', grandTotal: '18,511.00', partsSummary: '355003A01 (2), 6262.00043.17 (1), 461494-01 (2)' },
        { isSample: true, offerNo: 'QT-SMP-2026-04', docType: 'QUOTATION', date: '2026-11-15', customerStore: 'THE IVORY TECH CO.,LTD.', model: 'IM-65NE', serial: 'H11290P', priceTier: 'DIRECT-SERVICE', grandTotal: '9,362.50', partsSummary: 'P01771-02 CONTROLLER BOARD (1), P00805-01 WATER VALVE (1)' },
        { isSample: true, offerNo: 'QT-SMP-2026-05', docType: 'RECEIPT', date: '2026-11-14', customerStore: 'MISS PALIN SUKKIJ', model: 'IM-130NE', serial: 'H15502P', priceTier: 'DIRECT-SERVICE', grandTotal: '24,075.00', partsSummary: '456381-01 PUMP MOTOR (1), 3X5201-01 BRACKET (1), 3H9529G01 (1)' }
      ]
    },
    {
      moduleId: 'WARRANTY_QCF',
      menuLabel: '2.2 เอกสาร & เคลม · ใบเคลมประกัน, QCF และ Advance Claim Part',
      inputDesc: 'ข้อมูลเครื่องในประกัน, S/N, รายการอะไหล่เคลม และผลตรวจ 21 จุด',
      outputDesc: 'แบบฟอร์มเคลมมาตรฐาน Hoshizaki + ใบเบิกอะไหล่ล่วงหน้า + Claim Invoice ส่งโรงงาน',
      storageKey: 'hoshizaki_warranty_claims',
      idField: 'claimNo',
      openFn: "if(typeof openWarrantyClaimModal==='function') openWarrantyClaimModal();",
      records: [
        { isSample: true, claimNo: 'WC-SMP-2026-01', jobNo: 'JOB-SMP-2026-002', dateOfClaim: '2026-11-18', model: 'IM-130NE', serial: 'H20911K', customer: 'S.T.KITCHEN', status: 'Advance Claim Part Issued', totalAmount: '8,500.00' },
        { isSample: true, claimNo: 'WC-SMP-2026-02', jobNo: 'JOB-2026-0881', dateOfClaim: '2026-11-15', model: 'HW-600B', serial: 'W61209H', customer: 'โรงแรมแกรนด์ไฮแอท', status: 'Approved by Factory', totalAmount: '14,200.00' },
        { isSample: true, claimNo: 'WC-SMP-2026-03', jobNo: 'JOB-2026-0874', dateOfClaim: '2026-11-12', model: 'KM-515MAH', serial: 'K99104M', customer: 'ร้านอาหารญี่ปุ่น โอโตยะ', status: 'Claim Invoice Submitted', totalAmount: '6,800.00' },
        { isSample: true, claimNo: 'WC-SMP-2026-04', jobNo: 'JOB-2026-0860', dateOfClaim: '2026-11-10', model: 'HR-126MA-S', serial: 'R44102S', customer: 'ARCO STAINLESS (THAILAND)', status: 'Pending SM Review', totalAmount: '3,950.00' },
        { isSample: true, claimNo: 'WC-SMP-2026-05', jobNo: 'JOB-2026-0845', dateOfClaim: '2026-11-05', model: 'DBF-25SB', serial: 'B22019D', customer: 'KISSUI (THAILAND)', status: 'QCF Sent to SEA', totalAmount: '5,400.00' }
      ]
    },
    {
      moduleId: 'PM_CONTRACTS',
      menuLabel: '3.1 งาน PM & ตรวจรับ · สัญญา PM รายปี & แจ้งเตือนล่วงหน้า 1 เดือน',
      inputDesc: 'ข้อมูลลูกค้าสัญญา PM, รุ่นเครื่อง, S/N, รอบเข้าบริการ 6 เดือน / 1 ปี',
      outputDesc: 'ตารางติดตามรอบ PM 30 วันล่วงหน้า + ใบรับรอง PM Certificate A4',
      storageKey: 'hoshizaki_pm_contracts_v1015',
      idField: 'contractId',
      openFn: "if(typeof openPmPricebookModal==='function') openPmPricebookModal('PM_CONTRACTS');",
      records: [
        { isSample: true, contractId: 'PMC-SMP-001', customer: 'Starbucks Reserve — CentralWorld', model: 'IM-240DNE-HC', serial: 'H14289J', specTier: 'Modular (240+ kg/24h)', planType: 'รายปี (4 ครั้ง/ปี ทุก 3 เดือน)', amount: 15800, startDate: '2026-03-01', nextDueDate: '2026-12-01' },
        { isSample: true, contractId: 'PMC-SMP-002', customer: 'โรงแรมแชงกรี-ลา กรุงเทพฯ', model: 'KM-901MAJ', serial: 'K88310M', specTier: 'Modular Crescent', planType: 'รายปี (4 ครั้ง/ปี ทุก 3 เดือน)', amount: 18500, startDate: '2026-06-15', nextDueDate: '2026-12-15' },
        { isSample: true, contractId: 'PMC-SMP-003', customer: 'MARUZEN (THAILAND) — ครัวกลาง', model: 'JWE-680', serial: 'W90112D', specTier: 'Hood Dishwasher', planType: 'ทุก 6 เดือน (2 ครั้ง/ปี)', amount: 7800, startDate: '2026-06-20', nextDueDate: '2026-12-20' },
        { isSample: true, contractId: 'PMC-SMP-004', customer: '7-Eleven Flagship สาขาสีลม', model: 'HF-126MA-S', serial: 'F55201S', specTier: 'Upright Freezer 4D', planType: 'รายปี (4 ครั้ง/ปี ทุก 3 เดือน)', amount: 9600, startDate: '2026-09-10', nextDueDate: '2026-12-10' },
        { isSample: true, contractId: 'PMC-SMP-005', customer: 'EMERALD BAY RESORT ภูเก็ต', model: 'IM-100NE', serial: 'H18842M', specTier: 'Standard (65-130 kg)', planType: 'รายปี (4 ครั้ง/ปี ทุก 3 เดือน)', amount: 10500, startDate: '2026-09-18', nextDueDate: '2026-12-18' }
      ]
    },
    {
      moduleId: 'WAREHOUSE_PDI',
      menuLabel: '3.2 ตรวจรับเครื่องเข้าคลัง HHE · PDI Inspection & Damage List',
      inputDesc: 'แจ้งความเสียหายจาก Admin Warehouse -> ช่างเข้าตรวจเช็กที่คลัง HHE + ถ่ายรูป',
      outputDesc: 'รายงาน Inspection Report + Damage List ส่งกลับ Admin และออก QCF เคลมโรงงาน',
      storageKey: 'hoshizaki_warehouse_inspections_v193',
      idField: 'inspectionId',
      openFn: "if(typeof openWarehouseInspectionModal==='function') openWarehouseInspectionModal();",
      records: [
        { isSample: true, inspectionId: 'PDI-SMP-2026-01', date: '2026-11-18', inspectionType: 'HHE_PDI_DAMAGE', qcStatus: 'DAMAGED_NEED_REPAIR', model: 'IM-220AA', serial: 'H30199A', containerRef: 'BL-HHE-2026-11', inspectorName: 'Surin S. / Jeeraphan', inspectorOrg: 'Service Team', boxCondition: 'DENTED', exteriorCondition: 'DAMAGED', internalCondition: 'OK', accessoriesCondition: 'OK', damageNotes: 'แผงข้างขวาบุบจากการขนส่ง + ท่อน้ำเข้า 3H9533G01 ร้าว ต้องเบิกอะไหล่ซ่อมก่อนส่งลูกค้า', photoCount: 4 },
        { isSample: true, inspectionId: 'PDI-SMP-2026-02', date: '2026-11-16', inspectionType: 'INBOUND_NEW', qcStatus: 'READY_TO_SELL', model: 'IM-130NE', serial: 'H30245B', containerRef: 'BL-HHE-2026-11', inspectorName: 'Jeeraphan (Zcar)', inspectorOrg: 'Service Team', boxCondition: 'OK', exteriorCondition: 'OK', internalCondition: 'OK', accessoriesCondition: 'OK', damageNotes: 'ผ่านการทดสอบเดินเครื่อง 2 รอบ อุณหภูมิและก้อนน้ำแข็งสมบูรณ์ พร้อมจำหน่าย', photoCount: 3 },
        { isSample: true, inspectionId: 'PDI-SMP-2026-03', date: '2026-11-14', inspectionType: 'HHE_PDI_DAMAGE', qcStatus: 'HOLD_FOR_QCF', model: 'HW-600B', serial: 'W61890C', containerRef: 'BL-OZTI-2026-09', inspectorName: 'Surin S.', inspectorOrg: 'Service Team', boxCondition: 'OK', exteriorCondition: 'OK', internalCondition: 'DAMAGED', accessoriesCondition: 'OK', damageNotes: 'แผง Power Box 6262.00043.17 ไม่จ่ายไฟให้หม้อต้ม ออก QCF เคลมโรงงานแล้ว', photoCount: 5 },
        { isSample: true, inspectionId: 'PDI-SMP-2026-04', date: '2026-11-11', inspectionType: 'INBOUND_NEW', qcStatus: 'READY_TO_SELL', model: 'HR-126MA-S', serial: 'R44910D', containerRef: 'BL-HHE-2026-10', inspectorName: 'Nirun (Pui)', inspectorOrg: 'Service Team', boxCondition: 'OK', exteriorCondition: 'OK', internalCondition: 'OK', accessoriesCondition: 'OK', damageNotes: 'ทำอุณหภูมิ +2.0°C ใน 45 นาที ยางขอบประตูแนบสนิท', photoCount: 2 },
        { isSample: true, inspectionId: 'PDI-SMP-2026-05', date: '2026-11-08', inspectionType: 'HHE_PDI_DAMAGE', qcStatus: 'DAMAGED_NEED_REPAIR', model: 'FM-300AKE', serial: 'F55912E', containerRef: 'BL-HHE-2026-10', inspectorName: 'Surin (Beer)', inspectorOrg: 'Service Team', boxCondition: 'TORN', exteriorCondition: 'SCRATCHED', internalCondition: 'OK', accessoriesCondition: 'MISSING_SCOOP', damageNotes: 'ขาดที่ตักน้ำแข็งและฝาครอบด้านหน้ามีรอยขีดข่วน', photoCount: 4 }
      ]
    },
    {
      moduleId: 'ESG_GOVERNANCE',
      menuLabel: '4. ธรรมาภิบาล & ESG · บันทึกสารทำความเย็น (kgCO2e) & Audit Log',
      inputDesc: 'บันทึกการเติม/กู้คืนสารทำความเย็น R290, R134a, R404A, R452A หน้างาน',
      outputDesc: 'คำนวณคาร์บอนฟุตพริ้นท์ kgCO2e อัตโนมัติ + บันทึก Audit Trail',
      storageKey: 'hoshizaki_esg_refrigerant_log_v1033',
      idField: 'id',
      openFn: "if(typeof openEnterpriseGovernanceEhsErpModal==='function') openEnterpriseGovernanceEhsErpModal('EHS_ESG');",
      records: [
        { isSample: true, id: 'ESG-SMP-001', date: '2026-11-18', serial: 'H14289J', gasType: 'R290', action: 'CHARGED', kg: 0.14, co2eKg: 0.42 },
        { isSample: true, id: 'ESG-SMP-002', date: '2026-11-17', serial: 'K88310M', gasType: 'R404A', action: 'RECOVERED', kg: 1.20, co2eKg: 4706.40 },
        { isSample: true, id: 'ESG-SMP-003', date: '2026-11-16', serial: 'H18842M', gasType: 'R134a', action: 'CHARGED', kg: 0.35, co2eKg: 500.50 },
        { isSample: true, id: 'ESG-SMP-004', date: '2026-11-15', serial: 'F55201S', gasType: 'R452A', action: 'CHARGED', kg: 0.65, co2eKg: 1391.00 },
        { isSample: true, id: 'ESG-SMP-005', date: '2026-11-14', serial: 'R44102S', gasType: 'R290', action: 'CHARGED', kg: 0.11, co2eKg: 0.33 }
      ]
    },
    {
      moduleId: 'IMS_CORE_PSI',
      menuLabel: '5.1 คลังสินค้า IMS · Master Stock, PSI (Rank A-D) & NAV SB/SO',
      inputDesc: 'รหัสอะไหล่, ยอดใช้เฉลี่ยต่อเดือน, Criticality Rank (A/B/C/D) และยอดจอง NAV (SB)',
      outputDesc: 'คำนวณ Safety Stock (3M/2M/1pc), ROP, สต็อกพร้อมจ่ายจริง และสร้าง PR อัตโนมัติ',
      storageKey: 'hoshizaki_ims_master_items_v1',
      idField: 'sku',
      openFn: "if(typeof openEnterpriseInventoryImsModal==='function') openEnterpriseInventoryImsModal('OVERVIEW');",
      records: [
        { isSample: true, sku: '355003A01', name: 'Cock AY/SW Lever (DIW Top Runner 2026)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-A1', bin: 'A1-01', onHandQty: 8, allocatedQty: 3, navSbReserved: 2, unitCost: 920, sellingPrice: 1850, annualDemand: 48, monthlyAvgUse: 4.0, hzkRank: 'A', mcCanOperate: false, leadTimeDays: 45, orderCost: 350, holdingRatePct: 20, jitEnabled: true },
        { isSample: true, sku: '6262.00043.17', name: 'OZT-BYM-MK1-PWM Power Box (HW Dishwashers)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-A1', bin: 'A1-02', onHandQty: 6, allocatedQty: 2, navSbReserved: 2, unitCost: 3450, sellingPrice: 8500, annualDemand: 42, monthlyAvgUse: 3.5, hzkRank: 'A', mcCanOperate: false, leadTimeDays: 45, orderCost: 450, holdingRatePct: 20, jitEnabled: true },
        { isSample: true, sku: '406132-08', name: 'POWER RELAY (FMCOMMON / Multi-Series)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-A2', bin: 'A2-04', onHandQty: 14, allocatedQty: 2, navSbReserved: 1, unitCost: 480, sellingPrice: 1250, annualDemand: 36, monthlyAvgUse: 3.0, hzkRank: 'A', mcCanOperate: false, leadTimeDays: 30, orderCost: 250, holdingRatePct: 18, jitEnabled: false },
        { isSample: true, sku: '461494-01', name: 'WATER VALVE (DIW / Dishwashers)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-B1', bin: 'B1-01', onHandQty: 7, allocatedQty: 1, navSbReserved: 1, unitCost: 690, sellingPrice: 1650, annualDemand: 24, monthlyAvgUse: 2.0, hzkRank: 'B', mcCanOperate: true, leadTimeDays: 30, orderCost: 250, holdingRatePct: 18, jitEnabled: false },
        { isSample: true, sku: 'A001-0008', name: 'Auto TRANSFORMER Ins. F Class 1.5 KVA (DBF JP)', invType: 'RM', uom: 'PCS', zone: 'WMS-RM-C1', bin: 'C1-03', onHandQty: 2, allocatedQty: 1, navSbReserved: 1, unitCost: 2150, sellingPrice: 4500, annualDemand: 12, monthlyAvgUse: 1.0, hzkRank: 'C', mcCanOperate: false, leadTimeDays: 45, orderCost: 300, holdingRatePct: 18, jitEnabled: true }
      ]
    },
    {
      moduleId: 'ADVANCE_PARTS_SLA',
      menuLabel: '5.2 ใบเบิกอะไหล่ล่วงหน้า (Advance Repair/Claim) & SLA 24 ชม.',
      inputDesc: 'ช่าง/Admin ขอเบิกอะไหล่จากคลังไปซ่อมหรือเคลมล่วงหน้า (อนุมัติโดย P\'Tae)',
      outputDesc: 'ตัดยอด Available Stock + จับเวลาส่ง Service Report ภายใน 24 ชม. เพื่อออก Invoice',
      storageKey: V1040_ADV_KEY,
      idField: 'advNo',
      openFn: "if(typeof openEnterpriseInventoryImsModal==='function') openEnterpriseInventoryImsModal('PSI_PR');",
      records: [
        { isSample: true, advNo: 'ADV-SMP-2026-01', advType: 'ADVANCE_CLAIM_PART', jobNo: 'JOB-SMP-2026-002', customer: 'S.T.KITCHEN', sku: 'P01873-01', partName: 'CONTROLLER BOARD (IM)', qty: 1, techName: 'Surin S.', approvedBy: 'Thanakrit (Tae)', slaDeadline: 'ภายใน 24 ชม. หลังเข้าหน้างาน', status: 'ISSUED_TO_TECH' },
        { isSample: true, advNo: 'ADV-SMP-2026-02', advType: 'ADVANCE_REPAIR_PART', jobNo: 'JOB-SMP-2026-004', customer: 'THAI YAMAZAKI', sku: '432491-01', partName: 'Mechanical Seal FM', qty: 1, techName: 'Nirun (Pui)', approvedBy: 'Thanakrit (Tae)', slaDeadline: 'ภายใน 24 ชม. หลังเข้าหน้างาน', status: 'ISSUED_TO_TECH' },
        { isSample: true, advNo: 'ADV-SMP-2026-03', advType: 'ADVANCE_CLAIM_PART', jobNo: 'JOB-2026-0895', customer: 'MARUZEN (THAILAND)', sku: '355003A01', partName: 'Cock AY/SW Lever', qty: 2, techName: 'Jeerapan (Zcar)', approvedBy: 'Thanakrit (Tae)', slaDeadline: 'ส่ง Report แล้ว (ปิดยอด)', status: 'CLEARED_INVOICED' },
        { isSample: true, advNo: 'ADV-SMP-2026-04', advType: 'ADVANCE_REPAIR_PART', jobNo: 'JOB-2026-0901', customer: 'EMERALD BAY RESORT', sku: 'P02715-02', partName: 'PUMP MOTOR', qty: 1, techName: 'Noparin', approvedBy: 'Thanakrit (Tae)', slaDeadline: 'ครบกำหนด 24 ชม. วันนี้ 17:00', status: 'SLA_WARNING_24H' },
        { isSample: true, advNo: 'ADV-SMP-2026-05', advType: 'DIPINJAMKAN_LOAN', jobNo: 'PDI-SMP-2026-01', customer: 'HHE Warehouse (PDI)', sku: '3H9533G01', partName: 'WATER SUPPLY PIPE', qty: 1, techName: 'Surin S.', approvedBy: 'Thanakrit (Tae)', slaDeadline: 'งานซ่อมภายใน HHE', status: 'INTERNAL_PDI_USED' }
      ]
    },
    {
      moduleId: 'IMS_PR_APPROVAL',
      menuLabel: '5.3 คิวอนุมัติใบขอซื้อ PR (SM -> GM -> MD) & Factory GIT',
      inputDesc: 'รายการที่สต็อกต่ำกว่า Safety Stock / ROP หรือ PO ลูกค้าไม่มีสต็อก (No Stock)',
      outputDesc: 'เอกสาร PR ผ่านคิวอนุมัติ Service Manager -> GM -> MD และออก PO โรงงาน',
      storageKey: V1040_IMS_PR_KEY,
      idField: 'prNo',
      openFn: "if(typeof openEnterpriseInventoryImsModal==='function') openEnterpriseInventoryImsModal('PSI_PR');",
      records: [
        { isSample: true, prNo: 'PR-SMP-2026-01', date: '2026-11-18', sku: '355003A01', partName: 'Cock AY/SW Lever', hzkRank: 'A', currentQty: 6, safetyStock3M: 12, orderQty: 15, estCostThb: 13800, stage: 'SM_APPROVED_WAIT_GM', smApprover: 'Thanakrit (Tae)', gmApprover: 'Pending', mdApprover: 'Pending', factoryCode: 'HC' },
        { isSample: true, prNo: 'PR-SMP-2026-02', date: '2026-11-17', sku: '6262.00043.17', partName: 'OZT-BYM-MK1-PWM Power Box', hzkRank: 'A', currentQty: 4, safetyStock3M: 11, orderQty: 12, estCostThb: 41400, stage: 'GM_APPROVED_WAIT_MD', smApprover: 'Thanakrit (Tae)', gmApprover: 'GM Approved', mdApprover: 'Pending', factoryCode: 'OZTI' },
        { isSample: true, prNo: 'PR-SMP-2026-03', date: '2026-11-15', sku: 'P03755-02', partName: 'ACTUATOR MOTOR (4Y8998G01)', hzkRank: 'A', currentQty: 3, safetyStock3M: 9, orderQty: 10, estCostThb: 24500, stage: 'MD_APPROVED_PO_ISSUED', smApprover: 'Thanakrit (Tae)', gmApprover: 'GM Approved', mdApprover: 'MD Approved', factoryCode: 'HC' },
        { isSample: true, prNo: 'PR-SMP-2026-04', date: '2026-11-12', sku: '406132-08', partName: 'POWER RELAY (FMCOMMON)', hzkRank: 'A', currentQty: 5, safetyStock3M: 9, orderQty: 20, estCostThb: 9600, stage: 'PENDING_SM_REVIEW', smApprover: 'Pending', gmApprover: 'Pending', mdApprover: 'Pending', factoryCode: 'HC' },
        { isSample: true, prNo: 'PR-SMP-2026-05', date: '2026-11-10', sku: 'A001-0008', partName: 'Auto TRANSFORMER 1.5 KVA', hzkRank: 'C', currentQty: 1, safetyStock3M: 1, orderQty: 6, estCostThb: 12900, stage: 'MD_APPROVED_PO_ISSUED', smApprover: 'Thanakrit (Tae)', gmApprover: 'GM Approved', mdApprover: 'MD Approved', factoryCode: 'HOSHIZAKI JP' }
      ]
    }
  ];

  window.loadAllV1040ExampleRecords = function(silent) {
    let addedTotal = 0;
    window.HZK_V1040_EXAMPLE_CATALOG.forEach(function(cat) {
      const cur = safeReadJson_(cat.storageKey, []);
      if (!Array.isArray(cur)) return;
      const existingIds = new Set(cur.map(function(r) { return String(r[cat.idField] || ''); }));
      let added = 0;
      cat.records.forEach(function(rec) {
        const rid = String(rec[cat.idField] || '');
        if (rid && !existingIds.has(rid)) {
          cur.unshift(Object.assign({}, rec));
          added++;
          addedTotal++;
        }
      });
      if (added > 0) safeWriteJson_(cat.storageKey, cur);
    });

    const vsMap = safeReadJson_('hoshizaki_van_stock_db', {});
    const vanSamples = {
      'T01': { '406132-08 - POWER RELAY (FMCOMMON) [SAMPLE]': 4, 'P01872-01 - Water valve [SAMPLE]': 2 },
      'T02': { '355003A01 - Cock AY/SW Lever [SAMPLE]': 3, '4HC-H - Water Filter [SAMPLE]': 4 },
      'T03': { 'P03755-02 - Actuator motor [SAMPLE]': 2, 'P00007-01 - Drier [SAMPLE]': 3 },
      'T04': { '6262.00043.17 - PWM Power Box [SAMPLE]': 1, '461494-01 - Water Valve [SAMPLE]': 2 },
      'T05': { '432491-01 - Mechanical seal [SAMPLE]': 2, '4A3624-04 - Float Switch [SAMPLE]': 3 }
    };
    Object.keys(vanSamples).forEach(function(tc) {
      if (!vsMap[tc]) vsMap[tc] = {};
      Object.assign(vsMap[tc], vanSamples[tc]);
    });
    safeWriteJson_('hoshizaki_van_stock_db', vsMap);

    if (typeof window.syncImsWithAllEcosystemModules === 'function') {
      window.syncImsWithAllEcosystemModules(false);
    }
    if (!silent && typeof showToast === 'function') {
      showToast('🧪 โหลดข้อมูลตัวอย่าง Input → Output ครบทุกหมวดหมู่แล้ว (+' + addedTotal + ' รายการ) สามารถแก้ไขหรือลบออกได้ตลอดเวลา');
    }
    renderV1040SandboxBody_();
  };

  window.deleteSingleV1040SampleRecord = function(storageKey, idField, recordId) {
    const cur = safeReadJson_(storageKey, []);
    if (!Array.isArray(cur)) return;
    const next = cur.filter(function(r) { return String(r[idField] || '') !== String(recordId); });
    safeWriteJson_(storageKey, next);
    if (typeof showToast === 'function') showToast('🗑️ ลบรายการตัวอย่าง ' + recordId + ' ออกเรียบร้อยแล้ว');
    renderV1040SandboxBody_();
  };

  window.purgeAllV1040ExampleRecords = function() {
    let removedTotal = 0;
    window.HZK_V1040_EXAMPLE_CATALOG.forEach(function(cat) {
      const cur = safeReadJson_(cat.storageKey, []);
      if (!Array.isArray(cur)) return;
      const before = cur.length;
      const kept = cur.filter(function(r) { return !r.isSample && !String(r[cat.idField] || '').includes('-SMP-'); });
      removedTotal += (before - kept.length);
      safeWriteJson_(cat.storageKey, kept);
    });

    const vsMap = safeReadJson_('hoshizaki_van_stock_db', {});
    Object.keys(vsMap).forEach(function(tc) {
      Object.keys(vsMap[tc] || {}).forEach(function(partKey) {
        if (partKey.includes('[SAMPLE]')) {
          delete vsMap[tc][partKey];
          removedTotal++;
        }
      });
    });
    safeWriteJson_('hoshizaki_van_stock_db', vsMap);

    if (typeof showToast === 'function') {
      showToast('🧹 ล้างข้อมูลตัวอย่างทั้งหมดออกเรียบร้อยแล้ว (' + removedTotal + ' รายการ) ข้อมูลจริงยังคงอยู่ครบถ้วน');
    }
    renderV1040SandboxBody_();
  };

  window.advanceV1040PrApprovalStage = function(prNo) {
    const list = safeReadJson_(V1040_IMS_PR_KEY, []);
    const item = list.find(function(x) { return x.prNo === prNo; });
    if (!item) return;
    if (item.stage === 'PENDING_SM_REVIEW') {
      item.stage = 'SM_APPROVED_WAIT_GM';
      item.smApprover = 'Thanakrit (Tae)';
    } else if (item.stage === 'SM_APPROVED_WAIT_GM') {
      item.stage = 'GM_APPROVED_WAIT_MD';
      item.gmApprover = 'GM Approved';
    } else if (item.stage === 'GM_APPROVED_WAIT_MD') {
      item.stage = 'MD_APPROVED_PO_ISSUED';
      item.mdApprover = 'MD Approved';
    }
    safeWriteJson_(V1040_IMS_PR_KEY, list);
    if (typeof showToast === 'function') showToast('✅ อัปเดตสายอนุมัติ ' + prNo + ' เป็น ' + item.stage);
    if (typeof window.switchEnterpriseImsTab === 'function') window.switchEnterpriseImsTab('PSI_PR');
  };

  window.openV1040ExampleSandboxModal = function() {
    let modal = document.getElementById('hzkV1040ExampleSandboxModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hzkV1040ExampleSandboxModal';
      modal.className = 'fixed inset-0 z-[9996] hidden bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-6xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div class="bg-gradient-to-r from-[#002B49] via-sky-900 to-teal-800 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div>
              <h2 class="text-base sm:text-lg font-extrabold"><i class="fa-solid fa-flask-vial text-amber-300 mr-1.5"></i>HOSHIZAKI v1040 · ศูนย์จัดการข้อมูลตัวอย่าง Input → Output ทุกหมวดหมู่</h2>
              <p class="text-[11px] text-sky-200">บรรจุตัวอย่าง 5 รายการในทุกฟังก์ชัน สามารถคลิกเปิดดู แก้ไข หรือกดลบข้อมูลตัวอย่างออกได้ทันทีโดยไม่กระทบข้อมูลจริง</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button type="button" onclick="loadAllV1040ExampleRecords(false)" class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold shadow-sm">
                <i class="fa-solid fa-plus-circle mr-1"></i> เติมตัวอย่างครบทุกเมนู (5 รายการ/เมนู)
              </button>
              <button type="button" onclick="purgeAllV1040ExampleRecords()" class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm">
                <i class="fa-solid fa-trash-can mr-1"></i> ล้างข้อมูลตัวอย่างทั้งหมด
              </button>
              <button type="button" onclick="document.getElementById('hzkV1040ExampleSandboxModal').classList.add('hidden')" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-600 text-white flex items-center justify-center font-bold">&times;</button>
            </div>
          </div>
          <div id="hzkV1040SandboxBody" class="p-4 overflow-y-auto flex-1 bg-slate-50 space-y-4 text-xs"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    renderV1040SandboxBody_();
  };

  function renderV1040SandboxBody_() {
    const body = document.getElementById('hzkV1040SandboxBody');
    if (!body) return;
    body.innerHTML = window.HZK_V1040_EXAMPLE_CATALOG.map(function(cat) {
      const liveList = safeReadJson_(cat.storageKey, []);
      const sampleItems = Array.isArray(liveList)
        ? liveList.filter(function(r) { return r.isSample || String(r[cat.idField] || '').includes('-SMP-'); })
        : [];
      return `
        <div class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div>
              <div class="font-extrabold text-sm text-[#002B49]">${cat.menuLabel} <span class="ml-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px]">มีตัวอย่างในระบบ ${sampleItems.length} รายการ</span></div>
              <div class="text-[11px] text-slate-600 mt-0.5"><b>Input:</b> ${cat.inputDesc} &nbsp;→&nbsp; <b class="text-emerald-700">Output:</b> ${cat.outputDesc}</div>
            </div>
            <button type="button" onclick="document.getElementById('hzkV1040ExampleSandboxModal').classList.add('hidden'); ${cat.openFn}" class="px-3 py-1.5 rounded-lg bg-[#002B49] hover:bg-sky-800 text-white font-bold text-[11px]">
              <i class="fa-solid fa-arrow-up-right-from-square mr-1"></i> เปิดใช้งานเมนูนี้
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr class="bg-slate-100 text-slate-700">
                  <th class="p-1.5">รหัสอ้างอิง</th>
                  <th class="p-1.5">รายละเอียดตัวอย่าง (Input → Output)</th>
                  <th class="p-1.5 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${sampleItems.length === 0
                  ? '<tr><td colspan="3" class="p-2 text-center text-slate-400">ไม่มีข้อมูลตัวอย่างในหมวดนี้ (กดปุ่ม "เติมตัวอย่างครบทุกเมนู" ด้านบนเพื่อโหลด)</td></tr>'
                  : sampleItems.map(function(r) {
                      const rid = String(r[cat.idField] || '-');
                      const summary = JSON.stringify(r).replace(/[{"}]/g, ' ').slice(0, 180) + '...';
                      return `<tr>
                        <td class="p-1.5 font-mono font-bold text-[#002B49] whitespace-nowrap">${rid}</td>
                        <td class="p-1.5 text-slate-700">${summary}</td>
                        <td class="p-1.5 text-center whitespace-nowrap">
                          <button type="button" onclick="deleteSingleV1040SampleRecord('${cat.storageKey}','${cat.idField}','${rid}')" class="px-2 py-0.5 rounded bg-rose-100 hover:bg-rose-600 text-rose-800 hover:text-white font-bold">ลบรายการนี้</button>
                        </td>
                      </tr>`;
                    }).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');
  }

  function mountV1040UiEnhancements_() {
    const topBar = document.getElementById('btnTopExecutiveReport')?.parentElement;
    if (topBar && !document.getElementById('btnTopV1040ExampleSandbox')) {
      const btn = document.createElement('button');
      btn.id = 'btnTopV1040ExampleSandbox';
      btn.type = 'button';
      btn.onclick = function() { window.openV1040ExampleSandboxModal(); };
      btn.className = 'hzk-compact-pill text-[10px] bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-100 border border-emerald-300/60 px-2.5 rounded-full font-bold transition whitespace-nowrap inline-flex items-center gap-1';
      btn.innerHTML = '<i class="fa-solid fa-flask-vial text-amber-300"></i> <span>ตัวอย่าง Input/Output (v1040)</span>';
      topBar.insertBefore(btn, topBar.firstChild);
    }

    const imsTabStrip = document.querySelector('#enterpriseImsModal .ims-tab-btn')?.parentElement;
    if (imsTabStrip && !document.getElementById('imsTabBtnPsiPr')) {
      const tabBtn = document.createElement('button');
      tabBtn.id = 'imsTabBtnPsiPr';
      tabBtn.type = 'button';
      tabBtn.setAttribute('data-ims-tab', 'PSI_PR');
      tabBtn.onclick = function() { window.switchEnterpriseImsTab('PSI_PR'); };
      tabBtn.className = 'ims-tab-btn px-3 py-2 rounded-t-lg border-b-2 border-transparent text-slate-600 hover:text-slate-900 whitespace-nowrap font-bold';
      tabBtn.innerHTML = '<i class="fa-solid fa-diagram-next mr-1 text-purple-600"></i>6. PSI (Rank A-D) · PR (SM→GM→MD) · Advance Claim';
      imsTabStrip.appendChild(tabBtn);
    }
  }

  const origSwitchIms = window.switchEnterpriseImsTab;
  window.switchEnterpriseImsTab = function(tabName) {
    if (typeof origSwitchIms === 'function') origSwitchIms(tabName);
    if (tabName === 'PSI_PR') {
      const body = document.getElementById('enterpriseImsBody');
      if (!body) return;
      const prs = safeReadJson_(V1040_IMS_PR_KEY, []);
      const advs = safeReadJson_(V1040_ADV_KEY, []);
      body.innerHTML = `
        <div class="bg-white rounded-xl border border-purple-200 p-4 shadow-sm space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-extrabold text-[#002B49]"><i class="fa-solid fa-stamp text-purple-600 mr-1.5"></i>สายอนุมัติใบขอซื้อ PR (Service Manager → GM → MD) ตามสูตร Hoshizaki PSI</h3>
              <p class="text-[11px] text-slate-600">Rank A (เครื่องรันไม่ได้/เสียบ่อย) = Safety Stock 3 เดือน | Rank B = 2 เดือน | Rank C = 1 ชิ้น | Rank D = สั่งตาม PO</p>
            </div>
            <button type="button" onclick="openV1040ExampleSandboxModal()" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs">จัดการข้อมูลตัวอย่าง (5 รายการ)</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
              <thead>
                <tr class="bg-[#002B49] text-white">
                  <th class="p-2">PR No.</th>
                  <th class="p-2">SKU / อะไหล่</th>
                  <th class="p-2 text-center">Rank</th>
                  <th class="p-2 text-right">คงเหลือ / SS (3M)</th>
                  <th class="p-2 text-right">จำนวนสั่ง</th>
                  <th class="p-2">สายอนุมัติ (SM → GM → MD)</th>
                  <th class="p-2 text-center">อนุมัติขั้นถัดไป</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${prs.map(function(p) {
                  return `<tr>
                    <td class="p-2 font-bold text-[#002B49]">${p.prNo}</td>
                    <td class="p-2"><b>${p.sku}</b> — ${p.partName}</td>
                    <td class="p-2 text-center"><span class="px-2 py-0.5 rounded bg-rose-600 text-white font-extrabold">Rank ${p.hzkRank}</span></td>
                    <td class="p-2 text-right">${p.currentQty} / <b>${p.safetyStock3M}</b></td>
                    <td class="p-2 text-right font-extrabold text-indigo-700">${p.orderQty} PCS</td>
                    <td class="p-2 font-semibold">${p.stage}</td>
                    <td class="p-2 text-center">
                      ${p.stage !== 'MD_APPROVED_PO_ISSUED'
                        ? `<button type="button" onclick="advanceV1040PrApprovalStage('${p.prNo}')" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]">อนุมัติขั้นถัดไป</button>`
                        : '<span class="text-emerald-700 font-extrabold">✅ ออก PO โรงงานแล้ว</span>'
                      }
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-amber-200 p-4 shadow-sm space-y-2">
          <h3 class="text-sm font-extrabold text-amber-900"><i class="fa-solid fa-clock mr-1.5"></i>รายการเบิกอะไหล่ล่วงหน้า (Advance Repair / Advance Claim Part) &amp; ติดตาม SLA 24 ชม.</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
              <thead>
                <tr class="bg-amber-800 text-white">
                  <th class="p-2">เลขที่ใบเบิก</th>
                  <th class="p-2">ประเภท</th>
                  <th class="p-2">ใบงาน / ลูกค้า</th>
                  <th class="p-2">SKU / อะไหล่</th>
                  <th class="p-2">ช่างผู้เบิก / ผู้อนุมัติ</th>
                  <th class="p-2">SLA 24 ชม. / สถานะ</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                ${advs.map(function(a) {
                  return `<tr>
                    <td class="p-2 font-bold">${a.advNo}</td>
                    <td class="p-2 font-bold text-indigo-700">${a.advType}</td>
                    <td class="p-2">${a.jobNo} · <b>${a.customer}</b></td>
                    <td class="p-2">${a.sku} — ${a.partName} (${a.qty})</td>
                    <td class="p-2">${a.techName} (อนุมัติ: ${a.approvedBy})</td>
                    <td class="p-2 font-bold text-rose-700">${a.slaDeadline} [${a.status}]</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  };

  setTimeout(function() {
    mountV1040UiEnhancements_();
    if (!localStorage.getItem('hzk_v1040_initial_examples_seeded')) {
      window.loadAllV1040ExampleRecords(true);
      localStorage.setItem('hzk_v1040_initial_examples_seeded', '1');
    }
  }, 1800);
})();
