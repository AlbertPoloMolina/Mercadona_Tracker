/**
 * Gestor de Gráficos de Evolución de Precios con Chart.js
 */

let activeChart = null;

export function renderPriceChart(canvasElement, product) {
  if (!canvasElement || !window.Chart) return null;

  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }

  const ctx = canvasElement.getContext('2d');
  const history = product.history || [];

  if (history.length === 0) {
    return null;
  }

  // Si solo hay un registro, agregamos un punto duplicado virtual para que se dibuje una línea horizontal
  let labels = history.map(h => h.date);
  let dataPoints = history.map(h => h.price);

  if (history.length === 1) {
    labels = ['Inicio', history[0].date];
    dataPoints = [history[0].price, history[0].price];
  }

  // Gradiente verde esmeralda Mercadona
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, 'rgba(0, 139, 83, 0.45)');
  gradient.addColorStop(0.7, 'rgba(0, 139, 83, 0.08)');
  gradient.addColorStop(1, 'rgba(0, 139, 83, 0.0)');

  const minPrice = product.minPrice;
  const maxPrice = product.maxPrice;
  const avgPrice = product.avgPrice;

  // Rango del eje Y con holgura para mejor legibilidad
  const padding = (maxPrice - minPrice) * 0.18 || 0.3;
  const yMin = Math.max(0, Math.floor((minPrice - padding) * 10) / 10);
  const yMax = Math.ceil((maxPrice + padding) * 10) / 10;

  activeChart = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Precio (€)',
          data: dataPoints,
          borderColor: '#008b53',
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.28,
          pointBackgroundColor: '#008b53',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: history.length > 30 ? 3 : 5,
          pointHoverRadius: 7,
          pointHoverBackgroundColor: '#10b981',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 3
        },
        {
          label: 'Media (' + avgPrice.toFixed(2) + ' €)',
          data: Array(labels.length).fill(avgPrice),
          borderColor: 'rgba(245, 158, 11, 0.75)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            font: {
              family: "'Outfit', sans-serif",
              size: 12,
              weight: '500'
            },
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#64748b'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: "'Outfit', sans-serif", size: 13, weight: '600' },
          bodyFont: { family: "'Outfit', sans-serif", size: 12 },
          padding: 12,
          cornerRadius: 10,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          callbacks: {
            title: function (items) {
              return '📅 Ticket: ' + items[0].label;
            },
            label: function (context) {
              const val = context.parsed.y;
              if (context.datasetIndex === 0) {
                return `  💰 Precio pagado: ${val.toFixed(2)} €`;
              }
              return `  📊 Precio medio: ${val.toFixed(2)} €`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxTicksLimit: 8,
            font: { family: "'Outfit', sans-serif", size: 11 },
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#94a3b8'
          }
        },
        y: {
          min: yMin,
          max: yMax,
          grid: {
            color: 'rgba(148, 163, 184, 0.12)'
          },
          ticks: {
            callback: function (val) {
              return val.toFixed(2) + ' €';
            },
            font: { family: "'Outfit', sans-serif", size: 11 },
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#94a3b8'
          }
        }
      }
    }
  });

  return activeChart;
}

export function destroyActiveChart() {
  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }
}
