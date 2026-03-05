function splitTokens(expression) {
  return expression
    .split('|')
    .map((token) => token.trim())
    .filter(Boolean);
}

function resolvePath(data, pathExpression) {
  if (!pathExpression || pathExpression === '.') {
    return data;
  }

  const normalized = pathExpression.startsWith('.') ? pathExpression.slice(1) : pathExpression;
  if (!normalized) {
    return data;
  }

  const path = normalized.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);

  let value = data;
  for (const segment of path) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[segment];
  }

  return value;
}

function applyOperator(value, operator) {
  if (operator === 'length') {
    if (Array.isArray(value) || typeof value === 'string') {
      return value.length;
    }
    if (value && typeof value === 'object') {
      return Object.keys(value).length;
    }
    return 0;
  }

  if (operator === 'sum') {
    if (!Array.isArray(value)) {
      return Number(value) || 0;
    }
    return value.reduce((total, entry) => total + (Number(entry) || 0), 0);
  }

  if (operator === 'to_string') {
    return value === null || value === undefined ? '' : String(value);
  }

  if (operator.startsWith('join(')) {
    const match = operator.match(/join\(['"](.*)['"]\)/);
    const separator = match ? match[1] : ', ';
    if (!Array.isArray(value)) {
      return value;
    }
    return value.join(separator);
  }

  if (operator === 'lower') {
    return String(value ?? '').toLowerCase();
  }

  if (operator === 'upper') {
    return String(value ?? '').toUpperCase();
  }

  return value;
}

export function evaluateJq(expression, payload) {
  if (!expression || expression === '.') {
    return payload;
  }

  const tokens = splitTokens(expression);
  if (!tokens.length) {
    return payload;
  }

  let currentValue = resolvePath(payload, tokens[0]);
  for (const token of tokens.slice(1)) {
    currentValue = applyOperator(currentValue, token);
  }

  return currentValue;
}
