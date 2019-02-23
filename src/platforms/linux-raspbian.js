/**
 * Raspbian platform interface.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const child_process = require('child_process');
const fs = require('fs');

/**
 * Get DHCP server status.
 *
 * @returns {boolean} Boolean indicating whether or not DHCP is enabled.
 */
function getDhcpServerStatus() {
  const proc = child_process.spawnSync(
    'sudo',
    ['systemctl', 'is-active', 'dnsmasq.service']
  );
  return proc.status === 0;
}

/**
 * Set DHCP server status.
 *
 * @param {boolean} enabled - Whether or not to enable the DHCP server
 * @returns {boolean} Boolean indicating success of the command.
 */
function setDhcpServerStatus(enabled) {
  let proc = child_process.spawnSync(
    'sudo',
    ['systemctl', enabled ? 'start' : 'stop', 'dnsmasq.service']
  );
  if (proc.status !== 0) {
    return false;
  }

  proc = child_process.spawnSync(
    'sudo',
    ['systemctl', enabled ? 'enable' : 'disable', 'dnsmasq.service']
  );
  return proc.status === 0;
}

/**
 * Get the LAN mode and options.
 *
 * @returns {Object} {mode: 'static|dhcp|...', options: {...}}
 */
function getLanMode() {
  let mode = 'static';
  const options = {};

  if (!fs.existsSync('/etc/network/interfaces.d/eth0')) {
    mode = 'dhcp';
    return {mode, options};
  }

  const data = fs.readFileSync('/etc/network/interfaces.d/eth0', 'utf8');
  for (const line of data.trim().split('\n')) {
    const parts = line.trim().split(' ').filter((s) => s.length > 0);

    switch (parts[0]) {
      case 'iface':
        mode = parts[3];
        break;
      case 'address':
        options.ipaddr = parts[1];
        break;
      case 'netmask':
        options.netmask = parts[1];
        break;
      case 'gateway':
        options.gateway = parts[1];
        break;
      case 'dns-nameservers':
        options.dns = parts.slice(1);
        break;
    }
  }

  return {mode, options};
}

/**
 * Set the LAN mode and options.
 *
 * @param {string} mode - static, dhcp, ...
 * @param {Object?} options - options specific to LAN mode
 * @returns {boolean} Boolean indicating success.
 */
function setLanMode(mode, options = {}) {
  const valid = ['static', 'dhcp'];
  if (!valid.includes(mode)) {
    return false;
  }

  let entry = `auto eth0\niface eth0 inet ${mode}\n`;
  if (options.ipaddr) {
    entry += `    address ${options.ipaddr}\n`;
  }
  if (options.netmask) {
    entry += `    netmask ${options.netmask}\n`;
  }
  if (options.gateway) {
    entry += `    gateway ${options.gateway}\n`;
  }
  if (options.dns) {
    entry += `    dns-nameservers ${options.dns.join(' ')}\n`;
  }

  fs.writeFileSync('/tmp/eth0', entry);

  let proc = child_process.spawnSync(
    'sudo',
    ['mv', '/tmp/eth0', '/etc/network/interfaces.d/']
  );

  if (proc.status !== 0) {
    return false;
  }

  proc = child_process.spawnSync(
    'sudo',
    ['systemctl', 'restart', 'networking.service']
  );
  return proc.status === 0;
}

/**
 * Get SSH server status.
 *
 * @returns {boolean} Boolean indicating whether or not SSH is enabled.
 */
function getSshServerStatus() {
  const proc = child_process.spawnSync(
    'sudo',
    ['raspi-config', 'nonint', 'get_ssh'],
    {encoding: 'utf8'}
  );

  if (proc.status !== 0) {
    return false;
  }

  return proc.stdout.trim() === '0';
}

/**
 * Set SSH server status.
 *
 * @param {boolean} enabled - Whether or not to enable the SSH server
 * @returns {boolean} Boolean indicating success of the command.
 */
function setSshServerStatus(enabled) {
  const arg = enabled ? '1' : '0';
  const proc = child_process.spawnSync(
    'sudo',
    ['raspi-config', 'nonint', 'do_ssh', arg]
  );
  return proc.status === 0;
}

/**
 * Get mDNS server status.
 *
 * @returns {boolean} Boolean indicating whether or not mDNS is enabled.
 */
function getMdnsServerStatus() {
  const proc = child_process.spawnSync(
    'sudo',
    ['systemctl', 'is-active', 'avahi-daemon.service']
  );
  return proc.status === 0;
}

/**
 * Set mDNS server status.
 *
 * @param {boolean} enabled - Whether or not to enable the mDNS server
 * @returns {boolean} Boolean indicating success of the command.
 */
function setMdnsServerStatus(enabled) {
  let proc = child_process.spawnSync(
    'sudo',
    ['systemctl', enabled ? 'start' : 'stop', 'avahi-daemon.service']
  );
  if (proc.status !== 0) {
    return false;
  }

  proc = child_process.spawnSync(
    'sudo',
    ['systemctl', enabled ? 'enable' : 'disable', 'avahi-daemon.service']
  );
  return proc.status === 0;
}

/**
 * Get the system's hostname.
 *
 * @returns {string} The hostname.
 */
function getHostname() {
  return fs.readFileSync('/etc/hostname', 'utf8').trim();
}

/**
 * Set the system's hostname.
 *
 * @param {string} hostname - The hostname to set
 * @returns {boolean} Boolean indicating success of the command.
 */
function setHostname(hostname) {
  hostname = hostname.toLowerCase();
  const re = new RegExp(/^([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/);
  const valid = re.test(hostname) && hostname.length <= 63;
  if (!valid) {
    return false;
  }

  // Read in the current hostname
  let original = fs.readFileSync('/etc/hostname', 'utf8');
  if (original) {
    original = original.trim();
  }

  // Do this with sed, as it's the easiest way to write the file as root.
  let proc = child_process.spawnSync(
    'sudo',
    ['sed', '-i', '-e', `s/^.*$/${hostname}/`, '/etc/hostname']
  );
  if (proc.status !== 0) {
    return false;
  }

  proc = child_process.spawnSync('sudo', ['hostname', hostname]);
  if (proc.status !== 0) {
    // Set the original hostname back
    child_process.spawnSync(
      'sudo',
      ['sed', '-i', '-e', `s/^.*$/${original}/`, '/etc/hostname']
    );

    return false;
  }

  proc = child_process.spawnSync(
    'sudo',
    ['systemctl', 'restart', 'avahi-daemon.service']
  );
  if (proc.status !== 0) {
    // Set the original hostname back
    child_process.spawnSync(
      'sudo',
      ['sed', '-i', '-e', `s/^.*$/${original}/`, '/etc/hostname']
    );
    child_process.spawnSync('sudo', ['hostname', original]);

    return false;
  }

  proc = child_process.spawnSync(
    'sudo',
    [
      'sed',
      '-i',
      '-E',
      '-e',
      `s/(127\\.0\\.1\\.1[ \\t]+)${original}/\\1${hostname}/g`,
      '/etc/hosts',
    ]
  );
  return proc.status === 0;
}

/**
 * Restart the gateway process.
 *
 * @returns {boolean} Boolean indicating success of the command.
 */
function restartGateway() {
  const proc = child_process.spawnSync(
    'sudo',
    ['systemctl', 'restart', 'mozilla-iot-gateway.service']
  );

  // This will probably not fire, but just in case.
  return proc.status === 0;
}

/**
 * Restart the system.
 *
 * @returns {boolean} Boolean indicating success of the command.
 */
function restartSystem() {
  const proc = child_process.spawnSync('sudo', ['reboot']);

  // This will probably not fire, but just in case.
  return proc.status === 0;
}

module.exports = {
  getDhcpServerStatus,
  setDhcpServerStatus,
  getHostname,
  setHostname,
  getLanMode,
  setLanMode,
  getMdnsServerStatus,
  setMdnsServerStatus,
  getSshServerStatus,
  setSshServerStatus,
  restartGateway,
  restartSystem,
};
