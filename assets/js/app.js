const STORAGE_KEY = "akofinance-demo-v1";
const THEME_KEY = "akofinance-theme";

const supabaseConfig = window.AKOFINANCE_SUPABASE_CONFIG || {
  url: "",
  anonKey: "",
};

function randomId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function todayMinus(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const defaultState = {
  settings: {
    currency: "XOF",
  },
  accounts: [
    { name: "MTN Momo", openingBalance: 0 },
    { name: "Moov Money", openingBalance: 0 },
    { name: "Celtiis Cash", openingBalance: 0 },
    { name: "Cashless", openingBalance: 0 },
    { name: "Carte bancaire", openingBalance: 0 },
    { name: "Compte publicitaire", openingBalance: 0 },
    { name: "Portefeuille especes", openingBalance: 0 },
  ],
  categories: [
    "Alimentation",
    "Logement",
    "Transport",
    "Sante",
    "Habillement",
    "Divertissement",
    "Education",
    "Communication",
    "Impots et taxes",
    "Epargne et investissement",
    "Cadeaux et dons",
    "Imprevus",
    "Publicite",
  ],
  businesses: [
    "Framework",
    "Graphic Design",
    "E-commerce",
  ],
  budgets: [
    { category: "Alimentation", limit: 200000 },
    { category: "Transport", limit: 100000 },
    { category: "Publicite", limit: 250000 },
    { category: "Logement", limit: 300000 },
  ],
  transactions: [],
};

let state = loadLocalState();
let charts = {};
let deferredInstallPrompt = null;
let supabaseClient = null;
let session = null;
let persistenceMode = "local";
let dashboardFilters = {
  rangeType: "month",
  month: new Date().getMonth() + 1,
  span: 1,
  year: new Date().getFullYear(),
};

function loadLocalState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return normalizeStateShape(raw ? JSON.parse(raw) : cloneData(defaultState));
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cloneDefaultState() {
  return normalizeStateShape(cloneData(defaultState));
}

function getCurrentUser() {
  return session && session.user ? session.user : null;
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.setAttribute("open", "open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-open-modal");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.removeAttribute("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-open-modal");
}

function updateAccessLock() {
  const shouldLock = hasSupabaseConfig() && !getCurrentUser();
  const continueDemoButton = document.getElementById("continueDemoButton");
  const registerDemoButton = document.getElementById("registerDemoButton");
  const authScreen = document.getElementById("authScreen");
  const appShell = document.getElementById("appShell");
  const footer = document.querySelector(".site-footer");

  if (continueDemoButton) continueDemoButton.hidden = hasSupabaseConfig();
  if (registerDemoButton) registerDemoButton.hidden = hasSupabaseConfig();

  if (authScreen) authScreen.classList.toggle("is-active", shouldLock);
  if (appShell) appShell.classList.toggle("is-hidden", shouldLock);
  if (footer) footer.classList.toggle("is-hidden", shouldLock);
}

function currency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: state.settings.currency || "XOF",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function normalizeText(value) {
  return (value || "").toLowerCase();
}

function showFeedback(message, isError) {
  const node = document.getElementById("authFeedback");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error-text", Boolean(isError));
}

function toFriendlyAuthError(error) {
  if (!error) return "Une erreur est survenue.";
  if (error instanceof TypeError || error.message === "Failed to fetch") {
    return "Connexion impossible au serveur. Verifiez votre connexion internet, votre acces a Supabase, et ouvrez le site via http:// ou https://.";
  }
  if (error.message === "Invalid login credentials") {
    return "Identifiants invalides. Si vous venez de creer le compte, verifiez d'abord votre email de confirmation Supabase ou desactivez la confirmation d'email dans Supabase.";
  }
  return error.message || "Une erreur est survenue.";
}

function getSelectedSecurityQuestion() {
  const select = document.getElementById("securityQuestionSelect");
  const customWrap = document.getElementById("customSecurityQuestionWrap");
  const customInput = document.getElementById("customSecurityQuestion");
  if (!select) return "";

  if (select.value === "custom") {
    customWrap.classList.remove("is-hidden");
    customInput.required = true;
    return customInput.value.trim();
  }

  customWrap.classList.add("is-hidden");
  customInput.required = false;
  return select.value;
}

function setAuthTab(target) {
  document.querySelectorAll("[data-auth-tab]").forEach(function (item) {
    item.classList.toggle("is-active", item.getAttribute("data-auth-tab") === target);
  });
  document.querySelectorAll(".auth-panel").forEach(function (panel) {
    panel.classList.toggle("is-active", panel.id === `${target}Form`);
  });
}

function setSyncStatus(text) {
  return text;
}

function setUserChip(text) {
  return text;
}

function normalizeStateShape(rawState) {
  const nextState = rawState ? cloneData(rawState) : cloneDefaultState();
  nextState.accounts = (nextState.accounts || []).map(function (account) {
    if (typeof account === "string") {
      return { name: account, openingBalance: 0 };
    }
    return {
      name: account.name,
      openingBalance: Number(account.openingBalance || 0),
    };
  });
  nextState.transactions = nextState.transactions || [];
  nextState.categories = nextState.categories || [];
  nextState.businesses = nextState.businesses || [];
  nextState.budgets = nextState.budgets || [];
  nextState.settings = nextState.settings || { currency: "XOF" };
  return nextState;
}

function hasSupabaseConfig() {
  return Boolean(
    supabaseConfig.url &&
    supabaseConfig.anonKey &&
    window.supabase &&
    typeof window.supabase.createClient === "function"
  );
}

async function initSupabase() {
  if (!hasSupabaseConfig()) {
    setSyncStatus("Mode demo local");
    setUserChip("Aucun compte connecte");
    return;
  }

  supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  const sessionResult = await supabaseClient.auth.getSession();
  if (sessionResult.error) {
    console.error(sessionResult.error);
    setSyncStatus("Erreur Supabase");
    return;
  }

  session = sessionResult.data.session;
  if (session) {
    persistenceMode = "cloud";
    await hydrateFromCloud();
  } else {
    setSyncStatus("Supabase configure");
    setUserChip("Non connecte");
  }

  updateAccessLock();

  supabaseClient.auth.onAuthStateChange(async function (_event, nextSession) {
    session = nextSession;
    if (session) {
      persistenceMode = "cloud";
      await hydrateFromCloud();
    } else {
      persistenceMode = "local";
      state = loadLocalState();
      populateSelects();
      renderAll();
    }
    updateAuthUI();
    updateAccessLock();
  });
}

async function hydrateFromCloud() {
  if (!session || !supabaseClient) return;
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  const userId = currentUser.id;
  setSyncStatus("Synchronisation cloud");

  try {
    const responses = await Promise.all([
      supabaseClient.from("app_settings").select("currency, theme").eq("user_id", userId).maybeSingle(),
      supabaseClient.from("accounts").select("name, opening_balance").eq("user_id", userId).eq("archived", false).order("name"),
      supabaseClient.from("categories").select("name").eq("user_id", userId).eq("archived", false).order("name"),
      supabaseClient.from("businesses").select("name").eq("user_id", userId).eq("archived", false).order("name"),
      supabaseClient.from("budgets").select("category_name, monthly_limit").eq("user_id", userId).order("category_name"),
      supabaseClient.from("transactions").select("id, type, amount, currency, transaction_date, category_name, business_name, source_account, destination_account, importance_level, note").eq("user_id", userId).order("transaction_date", { ascending: false }),
    ]);

    const settingsRes = responses[0];
    const accountsRes = responses[1];
    const categoriesRes = responses[2];
    const businessesRes = responses[3];
    const budgetsRes = responses[4];
    const transactionsRes = responses[5];

    for (let i = 0; i < responses.length; i += 1) {
      if (responses[i].error) {
        throw responses[i].error;
      }
    }

    const hasRemoteData = Boolean(
      settingsRes.data ||
      (accountsRes.data && accountsRes.data.length) ||
      (categoriesRes.data && categoriesRes.data.length) ||
      (businessesRes.data && businessesRes.data.length) ||
      (budgetsRes.data && budgetsRes.data.length) ||
      (transactionsRes.data && transactionsRes.data.length)
    );

    if (!hasRemoteData) {
      state = cloneDefaultState();
    } else {
      state = {
        settings: {
          currency: settingsRes.data && settingsRes.data.currency ? settingsRes.data.currency : "XOF",
        },
        accounts: (accountsRes.data || []).map(function (row) {
          return {
            name: row.name,
            openingBalance: Number(row.opening_balance || 0),
          };
        }),
        categories: (categoriesRes.data || []).map(function (row) { return row.name; }),
        businesses: (businessesRes.data || []).map(function (row) { return row.name; }),
        budgets: (budgetsRes.data || []).map(function (row) {
          return {
            category: row.category_name,
            limit: Number(row.monthly_limit),
          };
        }),
        transactions: (transactionsRes.data || []).map(function (row) {
          return {
            id: row.id,
            type: row.type,
            amount: Number(row.amount),
            currency: row.currency,
            date: row.transaction_date,
            category: row.category_name || "",
            business: row.business_name || "",
            account: row.source_account || "",
            destinationAccount: row.destination_account || "",
            importance: Number(row.importance_level || 1),
            note: row.note || "",
          };
        }),
      };
    }

    saveLocalState();
    if (settingsRes.data && settingsRes.data.theme) {
      document.body.dataset.theme = settingsRes.data.theme;
      localStorage.setItem(THEME_KEY, settingsRes.data.theme);
    }

    populateSelects();
    renderAll();
    setSyncStatus("Mode cloud actif");
  } catch (error) {
    console.error(error);
    showFeedback("Connexion cloud etablie, mais la base Supabase n'est pas encore prete ou incomplete.", true);
    setSyncStatus("Erreur sync cloud");
  }
}

async function saveState() {
  saveLocalState();
  if (persistenceMode === "cloud" && session && supabaseClient) {
    try {
      await saveRemoteState();
    } catch (error) {
      console.error(error);
      showFeedback("Sauvegarde cloud echouee. Les donnees locales restent disponibles.", true);
      setSyncStatus("Cloud indisponible");
    }
  }
}

async function saveRemoteState() {
  const currentUser = getCurrentUser();
  if (!currentUser || !supabaseClient) return;
  const authUserResult = await supabaseClient.auth.getUser();
  if (authUserResult.error || !authUserResult.data || !authUserResult.data.user) {
    throw authUserResult.error || new Error("Utilisateur non authentifie.");
  }

  const authUser = authUserResult.data.user;
  const userId = authUser.id;
  if (userId !== currentUser.id) {
    throw new Error("Session utilisateur incoherente.");
  }

  const theme = document.body.dataset.theme || "light";
  setSyncStatus("Sauvegarde cloud");

  const settingsResult = await supabaseClient.from("app_settings").upsert({
    user_id: userId,
    currency: state.settings.currency,
    theme,
  }, { onConflict: "user_id" });

  if (settingsResult.error) throw settingsResult.error;

  await replaceRemoteTable("accounts", state.accounts.map(function (account) {
    return {
      user_id: userId,
      name: account.name,
      opening_balance: Number(account.openingBalance || 0),
      archived: false,
    };
  }));

  await replaceRemoteTable("categories", state.categories.map(function (name) {
    return { user_id: userId, name, archived: false };
  }));

  await replaceRemoteTable("businesses", state.businesses.map(function (name) {
    return { user_id: userId, name, archived: false };
  }));

  await replaceRemoteTable("budgets", state.budgets.map(function (budget) {
    return {
      user_id: userId,
      category_name: budget.category,
      monthly_limit: budget.limit,
    };
  }));

  await replaceRemoteTable("transactions", state.transactions.map(function (tx) {
    return {
      id: tx.id,
      user_id: userId,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      transaction_date: tx.date,
      category_name: tx.category,
      business_name: tx.business,
      source_account: tx.account,
      destination_account: tx.destinationAccount,
      importance_level: tx.importance,
      note: tx.note,
    };
  }));

  setSyncStatus("Mode cloud actif");
}

async function replaceRemoteTable(table, rows) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  const userId = currentUser.id;

  const deleteResult = await supabaseClient.from(table).delete().eq("user_id", userId);
  if (deleteResult.error) throw deleteResult.error;

  if (!rows.length) return;
  const insertResult = await supabaseClient.from(table).insert(rows);
  if (insertResult.error) throw insertResult.error;
}

async function signIn(email, password) {
  if (!supabaseClient) {
    showFeedback("Supabase n'est pas configure. Continuez en mode demo local.", true);
    return;
  }
  try {
    const result = await supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) {
      showFeedback(toFriendlyAuthError(result.error), true);
      return;
    }
  } catch (error) {
    showFeedback(toFriendlyAuthError(error), true);
  }
}

async function signUp(name, email, password, securityQuestion, securityAnswer) {
  if (!supabaseClient) {
    showFeedback("Supabase n'est pas configure. Continuez en mode demo local.", true);
    return;
  }

  try {
    const result = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          security_question: securityQuestion,
        },
      },
    });

    if (result.error) {
      showFeedback(toFriendlyAuthError(result.error), true);
      return;
    }

    if (result.data && result.data.user) {
      await supabaseClient.from("profiles").upsert({
        id: result.data.user.id,
        full_name: name,
        email,
        avatar_url: "",
        security_question: securityQuestion,
        security_answer: securityAnswer.trim().toLowerCase(),
      }, { onConflict: "id" });
    }

    if (result.data && result.data.session) {
      showFeedback("Compte cree et connexion active.");
      return;
    }

    showFeedback("Compte cree. Verifiez maintenant votre email pour confirmer le compte avant la premiere connexion.");
    setAuthTab("login");
  } catch (error) {
    showFeedback(toFriendlyAuthError(error), true);
  }
}

async function sendPasswordResetEmail(email) {
  if (!supabaseClient) {
    showFeedback("Supabase n'est pas configure.", true);
    return;
  }
  try {
    const result = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (result.error) {
      showFeedback(toFriendlyAuthError(result.error), true);
      return;
    }
    showFeedback("Email de reinitialisation envoye. Verifiez votre boite mail.");
    setAuthTab("login");
  } catch (error) {
    showFeedback(toFriendlyAuthError(error), true);
  }
}

async function loadSecurityQuestion(email) {
  if (!supabaseClient) return;
  try {
    const result = await supabaseClient.rpc("get_security_question", {
      p_email: email,
    });
    if (result.error) {
      showFeedback("Impossible de recuperer la question de securite pour cet email.", true);
      return;
    }
    const question = result.data || "";
    if (!question) {
      showFeedback("Aucune question de securite trouvee pour cet email.", true);
      return;
    }
    document.getElementById("forgotQuestionBlock").innerHTML = `
      <div class="list-item">
        <strong>Question de securite</strong>
        <span class="muted">${question}</span>
      </div>
    `;
    document.getElementById("forgotAnswerWrap").classList.remove("is-hidden");
    document.getElementById("forgotSubmitButton").textContent = "Envoyer le lien";
    document.getElementById("forgotSubmitButton").dataset.stage = "verify";
  } catch (error) {
    showFeedback(toFriendlyAuthError(error), true);
  }
}

async function verifySecurityAnswer(email, answer) {
  if (!supabaseClient) return false;
  try {
    const result = await supabaseClient.rpc("verify_security_answer", {
      p_email: email,
      p_answer: answer.trim().toLowerCase(),
    });
    if (result.error) {
      showFeedback("Verification impossible pour cette question de securite.", true);
      return false;
    }
    return Boolean(result.data);
  } catch (error) {
    showFeedback(toFriendlyAuthError(error), true);
    return false;
  }
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

function updateAuthUI() {
  const authButton = document.getElementById("authButton");
  const currentUser = getCurrentUser();
  if (!authButton) return;

  if (currentUser) {
    authButton.textContent = "Deconnexion";
    setSyncStatus("Mode cloud actif");
  } else {
    authButton.textContent = "Connexion";
    if (persistenceMode === "local") {
      setSyncStatus(hasSupabaseConfig() ? "Supabase configure" : "Mode demo local");
    }
  }
}

function getCurrentMonthTransactions() {
  const now = new Date();
  return state.transactions.filter(function (tx) {
    const date = new Date(tx.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
}

function buildMetrics() {
  const monthTransactions = getCurrentMonthTransactions();
  const income = monthTransactions.filter(function (tx) { return tx.type === "income"; }).reduce(function (sum, tx) { return sum + tx.amount; }, 0);
  const expenses = monthTransactions.filter(function (tx) { return tx.type === "expense"; }).reduce(function (sum, tx) { return sum + tx.amount; }, 0);
  const net = income - expenses;
  const balances = Object.fromEntries(state.accounts.map(function (account) {
    return [account.name, Number(account.openingBalance || 0)];
  }));

  state.transactions.forEach(function (tx) {
    if (tx.type === "income") balances[tx.account] = (balances[tx.account] || 0) + tx.amount;
    if (tx.type === "expense") balances[tx.account] = (balances[tx.account] || 0) - tx.amount;
    if (tx.type === "transfer") {
      balances[tx.account] = (balances[tx.account] || 0) - tx.amount;
      balances[tx.destinationAccount] = (balances[tx.destinationAccount] || 0) + tx.amount;
    }
  });

  return {
    income,
    expenses,
    net,
    treasury: Object.values(balances).reduce(function (sum, value) { return sum + value; }, 0),
    balances,
  };
}

function renderKPIs() {
  const metrics = buildMetrics();
  const cards = [
    { label: "Revenus du mois", value: currency(metrics.income), trend: "Entrees actives" },
    { label: "Depenses du mois", value: currency(metrics.expenses), trend: "Controle de sortie" },
    { label: "Benefice net", value: currency(metrics.net), trend: metrics.net >= 0 ? "Zone saine" : "A surveiller" },
    { label: "Tresorerie globale", value: currency(metrics.treasury), trend: "Tous comptes confondus" },
  ];

  document.getElementById("kpiGrid").innerHTML = cards.map(function (card) {
    return `
      <article class="panel kpi-card">
        <p class="eyebrow">${card.label}</p>
        <strong>${card.value}</strong>
        <span class="kpi-trend">${card.trend}</span>
      </article>
    `;
  }).join("");
}

function renderAlerts() {
  const monthTransactions = getCurrentMonthTransactions();
  const alerts = [];

  monthTransactions
    .filter(function (tx) { return tx.type === "expense" && Number(tx.importance) === 5; })
    .forEach(function (tx) {
      alerts.push(`Depense critique: ${tx.note || tx.category} pour ${currency(tx.amount)}.`);
    });

  state.budgets.forEach(function (budget) {
    const spent = monthTransactions
      .filter(function (tx) { return tx.type === "expense" && tx.category === budget.category; })
      .reduce(function (sum, tx) { return sum + tx.amount; }, 0);

    if (spent >= budget.limit) {
      alerts.push(`Budget ${budget.category} depasse: ${currency(spent)} sur ${currency(budget.limit)}.`);
    } else if (spent >= budget.limit * 0.8) {
      alerts.push(`Budget ${budget.category} proche du seuil: ${currency(spent)} sur ${currency(budget.limit)}.`);
    }
  });

  if (!alerts.length) {
    renderEmptyState("alertsList", "Aucune alerte pour le moment", "Vos notifications de budget et de depenses importantes apparaitront ici.");
    return;
  }

  document.getElementById("alertsList").innerHTML = alerts.map(function (text) {
    return `
      <div class="list-item">
        <strong>${text}</strong>
        <span class="muted">Analyse automatique sur les donnees du mois.</span>
      </div>
    `;
  }).join("");
}

function renderRecentTransactions() {
  const items = cloneData(state.transactions).sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  }).slice(0, 5);

  if (!items.length) {
    renderEmptyState("recentTransactions", "Aucune transaction enregistree", "Commencez par ajouter une premiere entree, depense ou transfert.");
    return;
  }

  document.getElementById("recentTransactions").innerHTML = items.map(function (tx) {
    return `
      <div class="list-item">
        <strong>${tx.note || tx.category}</strong>
        <span class="muted">${formatDate(tx.date)} · ${labelForType(tx.type)} · ${currency(tx.amount)}</span>
      </div>
    `;
  }).join("");
}

function renderEmptyState(targetId, title, text) {
  document.getElementById(targetId).innerHTML = `
    <div class="list-item">
      <strong>${title}</strong>
      <span class="muted">${text}</span>
    </div>
  `;
}

function labelForType(type) {
  if (type === "income") return "Revenu";
  if (type === "expense") return "Depense";
  return "Transfert";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(date));
}

function renderTransactionsTable() {
  const typeFilter = document.getElementById("typeFilter").value;
  const periodFilter = document.getElementById("periodFilter").value;
  const search = normalizeText(document.getElementById("searchFilter").value);
  const now = new Date();

  const rows = cloneData(state.transactions)
    .filter(function (tx) {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;

      const date = new Date(tx.date);
      if (periodFilter === "month" && (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) return false;
      if (periodFilter === "year" && date.getFullYear() !== now.getFullYear()) return false;
      if (periodFilter === "week") {
        const diff = (now - date) / (1000 * 60 * 60 * 24);
        if (diff > 7) return false;
      }

      const haystack = normalizeText([tx.note, tx.category, tx.business, tx.account, tx.destinationAccount].join(" "));
      return haystack.indexOf(search) !== -1;
    })
    .sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });

  document.getElementById("transactionsTableBody").innerHTML = rows.map(function (tx) {
    return `
      <tr>
        <td>${formatDate(tx.date)}</td>
        <td><span class="pill ${tx.type}">${labelForType(tx.type)}</span></td>
        <td>${currency(tx.amount)}</td>
        <td>${tx.business || tx.category}</td>
        <td>${tx.type === "transfer" ? `${tx.account} -> ${tx.destinationAccount}` : tx.account}</td>
        <td>${tx.importance}/5</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="6" class="muted">Aucune transaction pour ces filtres.</td></tr>`;
}

function renderBusinessCards() {
  const monthTransactions = getCurrentMonthTransactions();
  if (!state.businesses.length) {
    renderEmptyState("businessCards", "Aucun business configure", "Ajoutez vos activites dans Parametres pour suivre leur rentabilite.");
    return;
  }
  document.getElementById("businessCards").innerHTML = state.businesses.map(function (business) {
    const income = monthTransactions
      .filter(function (tx) { return tx.type === "income" && tx.business === business; })
      .reduce(function (sum, tx) { return sum + tx.amount; }, 0);
    const expenses = monthTransactions
      .filter(function (tx) { return tx.type === "expense" && tx.business === business; })
      .reduce(function (sum, tx) { return sum + tx.amount; }, 0);
    const net = income - expenses;

    return `
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Business</p>
            <h3>${business}</h3>
          </div>
          <span class="pill ${net >= 0 ? "income" : "expense"}">${net >= 0 ? "Rentable" : "Sous pression"}</span>
        </div>
        <div class="stack-list">
          <div class="mini-card"><strong>${currency(income)}</strong><span class="muted">Chiffre d'affaires</span></div>
          <div class="mini-card"><strong>${currency(expenses)}</strong><span class="muted">Depenses liees</span></div>
          <div class="mini-card"><strong>${currency(net)}</strong><span class="muted">Benefice net</span></div>
        </div>
      </article>
    `;
  }).join("");
}

function renderAccountsCards() {
  const balances = buildMetrics().balances;
  document.getElementById("accountsCards").innerHTML = state.accounts.map(function (account) {
    return `
      <article class="panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Compte</p>
            <h3>${account.name}</h3>
          </div>
          <span class="pill ${balances[account.name] >= 0 ? "income" : "expense"}">${balances[account.name] >= 0 ? "Stable" : "Negatif"}</span>
        </div>
        <div class="mini-card">
          <strong>${currency(balances[account.name])}</strong>
          <span class="muted">Solde actuel</span>
        </div>
        <div class="mini-card">
          <strong>${currency(Number(account.openingBalance || 0))}</strong>
          <span class="muted">Solde initial</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderAccountsSetup() {
  const target = document.getElementById("accountsSetupList");
  target.innerHTML = state.accounts.map(function (account) {
    return `
      <form class="inline-form account-balance-form" data-account-name="${escapeAttribute(account.name)}">
        <input type="text" value="${account.name}" disabled>
        <input type="number" name="openingBalance" min="0" step="0.01" value="${Number(account.openingBalance || 0)}" placeholder="Solde initial">
        <button class="primary-button" type="submit">Mettre a jour</button>
      </form>
    `;
  }).join("") || `
    <div class="list-item">
      <strong>Aucun compte configure</strong>
      <span class="muted">Ajoutez d'abord un compte dans Parametres pour definir son solde initial.</span>
    </div>
  `;

  document.querySelectorAll(".account-balance-form").forEach(function (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const name = form.getAttribute("data-account-name");
      const amountInput = form.querySelector('input[name="openingBalance"]');
      const nextAmount = Number(amountInput.value || 0);
      state.accounts = state.accounts.map(function (account) {
        if (account.name !== name) return account;
        return {
          name: account.name,
          openingBalance: nextAmount,
        };
      });
      await saveAndRender();
    });
  });
}

function renderBudgets() {
  const monthTransactions = getCurrentMonthTransactions();
  if (!state.budgets.length) {
    renderEmptyState("budgetsList", "Aucun budget configure", "Ajoutez ensuite vos limites mensuelles pour surveiller vos categories.");
    return;
  }
  document.getElementById("budgetsList").innerHTML = state.budgets.map(function (budget) {
    const spent = monthTransactions
      .filter(function (tx) { return tx.type === "expense" && tx.category === budget.category; })
      .reduce(function (sum, tx) { return sum + tx.amount; }, 0);
    const percent = budget.limit ? Math.min((spent / budget.limit) * 100, 100) : 0;

    return `
      <div class="budget-item">
        <div class="budget-head">
          <strong>${budget.category}</strong>
          <span>${currency(spent)} / ${currency(budget.limit)}</span>
        </div>
        <div class="progress"><span style="width:${percent}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderSettingsTags() {
  renderTagList("settingsAccounts", state.accounts, removeAccount);
  renderTagList("settingsBusinesses", state.businesses, removeBusiness);
  renderTagList("settingsCategories", state.categories, removeCategory);
}

function renderTagList(targetId, items, onRemove) {
  document.getElementById(targetId).innerHTML = items.map(function (item) {
    const label = typeof item === "string" ? item : item.name;
    return `
      <span class="tag">
        ${label}
        <button type="button" data-item="${escapeAttribute(label)}">x</button>
      </span>
    `;
  }).join("");

  document.querySelectorAll(`#${targetId} button`).forEach(function (button) {
    button.addEventListener("click", function () {
      onRemove(button.getAttribute("data-item"));
    });
  });
}

function escapeAttribute(value) {
  return value.replace(/"/g, "&quot;");
}

function removeAccount(name) {
  state.accounts = state.accounts.filter(function (item) { return item.name !== name; });
  saveAndRender();
}

function removeBusiness(name) {
  state.businesses = state.businesses.filter(function (item) { return item !== name; });
  saveAndRender();
}

function removeCategory(name) {
  state.categories = state.categories.filter(function (item) { return item !== name; });
  saveAndRender();
}

function populateSelects() {
  fillOptions("transactionCategory", state.categories, true);
  fillOptions("transactionBusiness", state.businesses, true);
  fillOptions("transactionAccount", state.accounts.map(function (account) { return account.name; }), false);
  fillOptions("transactionDestinationAccount", state.accounts.map(function (account) { return account.name; }), true);
  document.getElementById("transactionDate").value = new Date().toISOString().slice(0, 10);
}

function fillOptions(id, items, includeEmpty) {
  const select = document.getElementById(id);
  const first = includeEmpty ? `<option value="">Aucun</option>` : "";
  select.innerHTML = first + items.map(function (item) {
    return `<option value="${item}">${item}</option>`;
  }).join("");
}

function getDashboardPeriods() {
  if (dashboardFilters.rangeType === "week") {
    const periods = [];
    const now = new Date();
    for (let i = dashboardFilters.span - 1; i >= 0; i -= 1) {
      const end = new Date(now);
      end.setDate(now.getDate() - (i * 7));
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      periods.push({
        type: "week",
        start,
        end,
        label: `${start.getDate()}/${start.getMonth() + 1}`,
      });
    }
    return periods;
  }

  if (dashboardFilters.rangeType === "year") {
    const periods = [];
    for (let i = dashboardFilters.span - 1; i >= 0; i -= 1) {
      const year = dashboardFilters.year - i;
      periods.push({
        type: "year",
        year,
        label: String(year),
      });
    }
    return periods;
  }

  const periods = [];
  const end = new Date(dashboardFilters.year, dashboardFilters.month - 1, 1);
  for (let i = dashboardFilters.span - 1; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    periods.push({
      type: "month",
      year: d.getFullYear(),
      month: d.getMonth(),
      label: new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(d),
    });
  }
  return periods;
}

function getTransactionsForPeriod(period) {
  return state.transactions.filter(function (tx) {
    const d = new Date(tx.date);
    if (period.type === "week") return d >= period.start && d <= period.end;
    if (period.type === "year") return d.getFullYear() === period.year;
    return d.getFullYear() === period.year && d.getMonth() === period.month;
  });
}

function getTransactionsForSelectedRange() {
  return getDashboardPeriods().flatMap(function (period) {
    return getTransactionsForPeriod(period);
  });
}

function updateChartFilterSummary() {
  const summary = document.getElementById("chartFilterSummary");
  if (!summary) return;
  if (dashboardFilters.rangeType === "week") {
    summary.textContent = `${dashboardFilters.span} semaine(s)`;
    return;
  }
  if (dashboardFilters.rangeType === "year") {
    summary.textContent = `${dashboardFilters.span} annee(s)`;
    return;
  }
  summary.textContent = `${dashboardFilters.span} mois consecutif(s)`;
}

function populateDashboardFilters() {
  const yearSelect = document.getElementById("chartYear");
  if (!yearSelect) return;
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear - 5; year <= currentYear + 1; year += 1) years.push(year);
  yearSelect.innerHTML = years.map(function (year) {
    return `<option value="${year}">${year}</option>`;
  }).join("");
  document.getElementById("chartRangeType").value = String(dashboardFilters.rangeType);
  document.getElementById("chartMonth").value = String(dashboardFilters.month);
  document.getElementById("chartSpan").value = String(dashboardFilters.span);
  yearSelect.value = String(dashboardFilters.year);
  updateChartFilterSummary();
}

function renderCharts() {
  if (typeof Chart === "undefined") return;

  const cashflowCanvas = document.getElementById("cashflowChart");
  const categoryCanvas = document.getElementById("categoryChart");
  if (!cashflowCanvas || !categoryCanvas) return;

  const labels = getDashboardPeriods();
  const monthlyIncome = [];
  const monthlyExpense = [];

  labels.forEach(function (label) {
    const txs = getTransactionsForPeriod(label);

    monthlyIncome.push(txs.filter(function (tx) { return tx.type === "income"; }).reduce(function (sum, tx) { return sum + tx.amount; }, 0));
    monthlyExpense.push(txs.filter(function (tx) { return tx.type === "expense"; }).reduce(function (sum, tx) { return sum + tx.amount; }, 0));
  });

  const expenseByCategory = {};
  getTransactionsForSelectedRange().filter(function (tx) { return tx.type === "expense"; }).forEach(function (tx) {
    expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + tx.amount;
  });

  destroyCharts();

  charts.cashflow = new Chart(cashflowCanvas, {
    type: "line",
    data: {
      labels: labels.map(function (item) { return item.label; }),
      datasets: [
        {
          label: "Revenus",
          data: monthlyIncome,
          borderColor: "#15803d",
          backgroundColor: "rgba(21, 128, 61, 0.18)",
          tension: 0.35,
          fill: true,
        },
        {
          label: "Depenses",
          data: monthlyExpense,
          borderColor: "#c2410c",
          backgroundColor: "rgba(194, 65, 12, 0.14)",
          tension: 0.35,
          fill: true,
        },
      ],
    },
    options: chartOptions(),
  });

  charts.category = new Chart(categoryCanvas, {
    type: "doughnut",
    data: {
      labels: Object.keys(expenseByCategory).length ? Object.keys(expenseByCategory) : ["Aucune depense"],
      datasets: [{
        data: Object.values(expenseByCategory).length ? Object.values(expenseByCategory) : [1],
        backgroundColor: ["#0e7a5f", "#123d52", "#c79a2b", "#d97706", "#2563eb", "#8b5cf6"],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: getComputedStyle(document.body).getPropertyValue("--text"),
          },
        },
      },
    },
  });
}

function chartOptions() {
  const style = getComputedStyle(document.body);
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        labels: {
          color: style.getPropertyValue("--text"),
        },
      },
    },
    scales: {
      x: {
        ticks: { color: style.getPropertyValue("--text-soft") },
        grid: { color: "rgba(127,127,127,0.08)" },
      },
      y: {
        ticks: { color: style.getPropertyValue("--text-soft") },
        grid: { color: "rgba(127,127,127,0.08)" },
      },
    },
  };
}

function destroyCharts() {
  Object.values(charts).forEach(function (chart) {
    if (chart && typeof chart.destroy === "function") {
      chart.destroy();
    }
  });
  charts = {};
}

async function saveAndRender() {
  populateSelects();
  renderAll();
  await saveState();
}

function renderAll() {
  renderKPIs();
  renderAlerts();
  renderRecentTransactions();
  renderTransactionsTable();
  renderBusinessCards();
  renderAccountsSetup();
  renderAccountsCards();
  renderBudgets();
  renderSettingsTags();
  populateDashboardFilters();
  renderCharts();
  populateProfileView();
}

function populateProfileView() {
  const currentUser = getCurrentUser();
  const nameInput = document.getElementById("profileNameInput");
  const emailInput = document.getElementById("profileEmailInput");
  const nameDisplay = document.getElementById("profileNameDisplay");
  const emailDisplay = document.getElementById("profileEmailDisplay");
  const avatarPreview = document.getElementById("profileAvatarPreview");

  if (!nameInput || !emailInput || !nameDisplay || !emailDisplay || !avatarPreview) return;

  if (!currentUser) {
    nameInput.value = "";
    emailInput.value = "";
    nameDisplay.textContent = "Mon profil";
    emailDisplay.textContent = "Aucune adresse email";
    avatarPreview.src = "./assets/images/logo.png";
    return;
  }

  const fullName = currentUser.user_metadata && currentUser.user_metadata.full_name ? currentUser.user_metadata.full_name : "";
  const avatarUrl = currentUser.user_metadata && currentUser.user_metadata.avatar_url ? currentUser.user_metadata.avatar_url : "./assets/images/logo.png";

  nameInput.value = fullName;
  emailInput.value = currentUser.email || "";
  nameDisplay.textContent = fullName || "Mon profil";
  emailDisplay.textContent = currentUser.email || "";
  avatarPreview.src = avatarUrl;
}

async function updateProfile() {
  const currentUser = getCurrentUser();
  if (!currentUser || !supabaseClient) return;

  const fullName = document.getElementById("profileNameInput").value.trim();
  const avatarInput = document.getElementById("profileAvatarInput");
  let avatarUrl = currentUser.user_metadata && currentUser.user_metadata.avatar_url ? currentUser.user_metadata.avatar_url : "";

  if (avatarInput.files && avatarInput.files[0]) {
    const file = avatarInput.files[0];
    const path = `${currentUser.id}/${Date.now()}-${file.name}`;
    const uploadResult = await supabaseClient.storage.from("avatars").upload(path, file, {
      upsert: true,
    });
    if (uploadResult.error) {
      showFeedback("Upload de la photo impossible. Creez d'abord le bucket public `avatars` dans Supabase.", true);
      return;
    }
    const publicUrlResult = supabaseClient.storage.from("avatars").getPublicUrl(path);
    avatarUrl = publicUrlResult.data.publicUrl;
  }

  const updateResult = await supabaseClient.auth.updateUser({
    data: {
      full_name: fullName,
      avatar_url: avatarUrl,
    },
  });

  if (updateResult.error) {
    showFeedback(toFriendlyAuthError(updateResult.error), true);
    return;
  }

  await supabaseClient.from("profiles").upsert({
    id: currentUser.id,
    full_name: fullName,
    email: currentUser.email,
    avatar_url: avatarUrl,
  }, { onConflict: "id" });

  session = (await supabaseClient.auth.getSession()).data.session;
  populateProfileView();
  showFeedback("Profil mis a jour.");
}

async function updatePassword() {
  const currentUser = getCurrentUser();
  if (!currentUser || !supabaseClient) return;

  const password = document.getElementById("profilePassword").value;
  const confirmPassword = document.getElementById("profilePasswordConfirm").value;

  if (!password || password.length < 6) {
    showFeedback("Le mot de passe doit contenir au moins 6 caracteres.", true);
    return;
  }

  if (password !== confirmPassword) {
    showFeedback("Les deux mots de passe ne correspondent pas.", true);
    return;
  }

  const result = await supabaseClient.auth.updateUser({
    password,
  });

  if (result.error) {
    showFeedback(toFriendlyAuthError(result.error), true);
    return;
  }

  document.getElementById("passwordForm").reset();
  showFeedback("Mot de passe mis a jour.");
}

function setupNavigation() {
  document.querySelectorAll(".nav-link[data-view]").forEach(function (button) {
    button.addEventListener("click", function () {
      const target = button.getAttribute("data-view");
      document.querySelectorAll(".nav-link[data-view]").forEach(function (item) {
        item.classList.toggle("is-active", item.getAttribute("data-view") === target);
      });
      document.querySelectorAll(".view").forEach(function (view) {
        view.classList.toggle("is-active", view.id === `${target}View`);
      });
      document.getElementById("viewTitle").textContent = button.textContent;
      document.getElementById("mobileNav").classList.remove("is-open");
    });
  });

  document.querySelectorAll("[data-auth-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      setAuthTab(button.getAttribute("data-auth-tab"));
    });
  });
}

function setupForms() {
  document.getElementById("openTransactionModal").addEventListener("click", function () {
    openModal("transactionModal");
  });

  document.getElementById("mobileTransactionButton").addEventListener("click", function () {
    openModal("transactionModal");
    document.getElementById("mobileNav").classList.remove("is-open");
  });

  document.getElementById("dashboardQuickAdd").addEventListener("click", function () {
    openModal("transactionModal");
  });

  document.getElementById("closeTransactionModal").addEventListener("click", function () {
    closeModal("transactionModal");
  });

  document.getElementById("transactionForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const transaction = {
      id: randomId(),
      type: document.getElementById("transactionType").value,
      amount: Number(document.getElementById("transactionAmount").value),
      date: document.getElementById("transactionDate").value,
      currency: document.getElementById("transactionCurrency").value,
      category: document.getElementById("transactionCategory").value || "Non classe",
      business: document.getElementById("transactionBusiness").value,
      account: document.getElementById("transactionAccount").value,
      destinationAccount: document.getElementById("transactionDestinationAccount").value,
      importance: Number(document.getElementById("transactionImportance").value),
      note: document.getElementById("transactionNote").value.trim(),
    };

    state.transactions.push(transaction);
    await saveAndRender();
    event.target.reset();
    document.getElementById("transactionDate").value = new Date().toISOString().slice(0, 10);
    closeModal("transactionModal");
  });

  document.getElementById("accountForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const input = document.getElementById("accountNameInput");
    const balanceInput = document.getElementById("accountBalanceInput");
    const value = input.value.trim();
    const openingBalance = Number(balanceInput.value || 0);
    const exists = state.accounts.some(function (account) { return account.name === value; });
    if (value && !exists) {
      state.accounts.push({
        name: value,
        openingBalance,
      });
      await saveAndRender();
    }
    input.value = "";
    balanceInput.value = "";
  });

  document.getElementById("businessForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const input = document.getElementById("businessNameInput");
    const value = input.value.trim();
    if (value && state.businesses.indexOf(value) === -1) {
      state.businesses.push(value);
      await saveAndRender();
    }
    input.value = "";
  });

  document.getElementById("categoryForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const input = document.getElementById("categoryNameInput");
    const value = input.value.trim();
    if (value && state.categories.indexOf(value) === -1) {
      state.categories.push(value);
      await saveAndRender();
    }
    input.value = "";
  });

  ["typeFilter", "periodFilter", "searchFilter"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", renderTransactionsTable);
  });

  document.getElementById("resetDemoData").addEventListener("click", async function () {
    state = cloneDefaultState();
    await saveAndRender();
  });

  document.getElementById("authButton").addEventListener("click", async function () {
    if (getCurrentUser()) {
      await signOut();
      return;
    }
    updateAccessLock();
    setAuthTab("login");
  });

  document.getElementById("continueDemoButton").addEventListener("click", function () {
    if (hasSupabaseConfig()) return;
    updateAccessLock();
  });

  document.getElementById("registerDemoButton").addEventListener("click", function () {
    if (hasSupabaseConfig()) return;
    updateAccessLock();
  });

  document.getElementById("loginForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    await signIn(
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPassword").value
    );
  });

  document.getElementById("registerForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("registerPasswordConfirm").value;
    const securityQuestion = getSelectedSecurityQuestion();
    const securityAnswer = document.getElementById("securityAnswer").value;

    if (password !== confirmPassword) {
      showFeedback("Les deux mots de passe ne correspondent pas.", true);
      return;
    }

    if (!securityQuestion) {
      showFeedback("Choisissez ou personnalisez votre question de securite.", true);
      return;
    }

    if (!securityAnswer.trim()) {
      showFeedback("La reponse a la question de securite est obligatoire.", true);
      return;
    }

    await signUp(
      document.getElementById("registerName").value.trim(),
      document.getElementById("registerEmail").value.trim(),
      password,
      securityQuestion,
      securityAnswer
    );
  });

  document.getElementById("securityQuestionSelect").addEventListener("change", function () {
    getSelectedSecurityQuestion();
  });

  document.querySelectorAll(".toggle-password").forEach(function (button) {
    button.addEventListener("click", function () {
      const targetId = button.getAttribute("data-password-target");
      const input = document.getElementById(targetId);
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      button.textContent = isPassword ? "Masquer" : "Afficher";
    });
  });

  document.getElementById("openForgotPassword").addEventListener("click", function () {
    setAuthTab("forgotPassword");
    document.getElementById("forgotQuestionBlock").innerHTML = "";
    document.getElementById("forgotAnswerWrap").classList.add("is-hidden");
    document.getElementById("forgotSubmitButton").textContent = "Verifier";
    document.getElementById("forgotSubmitButton").dataset.stage = "question";
  });

  document.getElementById("backToLogin").addEventListener("click", function () {
    setAuthTab("login");
  });

  document.getElementById("mobileMenuToggle").addEventListener("click", function () {
    document.getElementById("mobileNav").classList.toggle("is-open");
  });

  ["chartRangeType", "chartMonth", "chartSpan", "chartYear"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () {
      dashboardFilters.rangeType = document.getElementById("chartRangeType").value;
      dashboardFilters.month = Number(document.getElementById("chartMonth").value);
      dashboardFilters.span = Number(document.getElementById("chartSpan").value);
      dashboardFilters.year = Number(document.getElementById("chartYear").value);
      updateChartFilterSummary();
      renderCharts();
    });
  });

  document.getElementById("forgotPasswordForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const email = document.getElementById("forgotEmail").value.trim();
    const stage = document.getElementById("forgotSubmitButton").dataset.stage || "question";

    if (stage === "question") {
      await loadSecurityQuestion(email);
      return;
    }

    const answer = document.getElementById("forgotAnswer").value;
    const isValid = await verifySecurityAnswer(email, answer);
    if (!isValid) {
      showFeedback("Reponse de securite incorrecte.", true);
      return;
    }
    await sendPasswordResetEmail(email);
  });

  const transactionModal = document.getElementById("transactionModal");
  transactionModal.addEventListener("click", function (event) {
    if (event.target === transactionModal) {
      closeModal("transactionModal");
    }
  });

  document.getElementById("profileForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    await updateProfile();
  });

  document.getElementById("passwordForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    await updatePassword();
  });
}

function setupTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  document.body.dataset.theme = savedTheme;
  document.getElementById("themeToggle").addEventListener("click", async function () {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    renderCharts();
    if (persistenceMode === "cloud") {
      await saveState();
    }
  });

  document.getElementById("mobileThemeButton").addEventListener("click", async function () {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    renderCharts();
    document.getElementById("mobileNav").classList.remove("is-open");
    if (persistenceMode === "cloud") {
      await saveState();
    }
  });
}

function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js");
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  document.getElementById("installButton").addEventListener("click", async function () {
    if (!deferredInstallPrompt) {
      alert("L'installation PWA n'est pas encore disponible dans ce navigateur. Utilisez sinon l'option d'installation native du navigateur.");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });

  document.getElementById("mobileInstallButton").addEventListener("click", async function () {
    if (!deferredInstallPrompt) {
      alert("L'installation PWA n'est pas encore disponible dans ce navigateur. Utilisez sinon l'option d'installation native du navigateur.");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById("mobileNav").classList.remove("is-open");
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  setupNavigation();
  setupForms();
  setupTheme();
  setupPWA();
  populateSelects();
  renderAll();
  updateAuthUI();
  await initSupabase();
  updateAccessLock();
});
