import crypto from 'node:crypto';

function randomBlock(size = 4) {
  return crypto.randomBytes(size).toString('hex').toUpperCase();
}

export function createLicenseKey(prefix = 'PLD') {
  return `${prefix}-${randomBlock(4)}-${randomBlock(2)}-${randomBlock(2)}-${randomBlock(2)}-${randomBlock(6)}`;
}

export function createId() {
  return crypto.randomUUID();
}

export function createActivationToken() {
  return crypto.randomBytes(32).toString('hex');
}
