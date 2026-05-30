
    let deletedIngredients = []; 
    let deletedEtapes = [];      
    let userEmail = localStorage.getItem('fitbuddy_email');
    let storedName = localStorage.getItem('fitbuddy_user_name');
    const N8N_URL = "https://greedily-submarine-prance.ngrok-free.dev";
    const RAYONS = ["Frais", "Boulangerie & Viennoiserie", "Fruits & Légumes frais", "Boucherie & Volaille", "Poissonnerie", "Pâtes Riz & féculents", "Conserves de Légumes & Plats Cuisinés", "Conserves de Poisson", "Huiles Vinaigres Epices & Sauces", "Apéritif", "Petit-déjeuner", "Biscuits & Gâteaux", "Confiserie & Chocolat", "Confitures Miels & Pâtes à tantiner", "Aide à la pâtisserie", "Lait & Oeufs", "Produits laitiers", "Surgelés", "Boissons", "Hygiène", "Entretien de la maison", "Animalerie", "Loisirs", "Autres"];

    let currentList = [];
    let isListening = false;
    let recipesCache = []; 
    let searchModalMode = "recipe"; 
    let activeConsumedFood = null; 

    // États actifs des filtres de vue (perso, coloc, tout)
    let activeShoppingFilter = "perso"; // Par défaut "perso", basculera sur "coloc" si un groupe existe
    let activeRecipeFilter = "perso";   // Par défaut "perso", basculera sur "coloc" si un groupe existe

    // Liste dynamique des e-mails membres du groupe (chargée depuis le profil)
    let currentGroupMembers = []; 
    let currentGroupName = "";

    function updateGroupData(user) {
        if (!user) return;
        const membresRaw = user.membres_groupe || user.membresGroupe || "";
        currentGroupName = user.nom_groupe || user.nomGroupe || "";
        currentGroupMembers = typeof membresRaw === 'string' 
            ? membresRaw.split(',').map(s => s.trim()).filter(Boolean)
            : (Array.isArray(membresRaw) ? membresRaw : []);
            
        // Ajustement dynamique du filtre actif : "coloc" si groupe valide, sinon "perso"
        const hasGroup = currentGroupMembers.length > 0 && currentGroupName;
        activeShoppingFilter = hasGroup ? "coloc" : "perso";
        activeRecipeFilter = hasGroup ? "coloc" : "perso";
    }

    // Chargement initial du groupe depuis le cache local
    try {
        const cached = JSON.parse(localStorage.getItem('fitbuddy_user_profile'));
        if (cached) {
            updateGroupData(cached);
        }
    } catch(e) {}

    function extractOwnerEmail(item) {
        if (!item) return "";
        if (item.property_utilisateur) return item.property_utilisateur;
        if (item.utilisateur) return item.utilisateur;
        if (item.email) return item.email;
        if (item.property_email) return item.property_email;

        // Notion raw properties structure
        const props = item.properties || {};
        for (const key of Object.keys(props)) {
            const kl = key.toLowerCase();
            if (kl === "utilisateur" || kl === "email" || kl === "propriétaire" || kl === "proprietaire") {
                const prop = props[key];
                if (!prop) continue;
                if (prop.type === "email" && prop.email) return prop.email;
                if (prop.type === "rich_text" && prop.rich_text && prop.rich_text.length > 0) return prop.rich_text[0].plain_text || "";
                if (prop.type === "select" && prop.select) return prop.select.name || "";
                if (typeof prop === "string") return prop;
            }
        }
        return "";
    }

    function getFilteredItems(allItems, activeFilter) {
        const currentUserEmail = (localStorage.getItem('fitbuddy_email') || "").trim().toLowerCase();
        
        // Liste dynamique des e-mails du groupe (avec fallback sur l'e-mail perso si aucun groupe)
        let groupEmails = currentGroupMembers.length > 0 
            ? currentGroupMembers.map(email => email.trim().toLowerCase())
            : [currentUserEmail];
        
        // S'assurer que l'utilisateur connecté fait toujours partie de son groupe de filtrage
        if (!groupEmails.includes(currentUserEmail)) {
            groupEmails.push(currentUserEmail);
        }

        return allItems.filter(item => {
            const owner = extractOwnerEmail(item).trim().toLowerCase();
            
            if (activeFilter === "perso") {
                // Dans la vue perso, on ne montre que les éléments créés par l'utilisateur connecté (les éléments sans propriétaire sont masqués)
                return owner === currentUserEmail;
            } else if (activeFilter === "coloc") {
                // Dans la vue coloc, on montre les éléments du groupe ET les éléments sans propriétaire (considérés comme publics/modèles)
                return !owner || groupEmails.includes(owner);
            } else {
                return true; // Tout afficher
            }
        });
    }

    window.addEventListener('load', () => { 
        lucide.createIcons();
        if (storedName) updateUserNameUI(storedName);
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js?v=7').catch(err => console.log("SW Error:", err));
        }
        checkAuth(); 
    });

    // Expose OTP and profile functions to window for index.html onclicks
    window.requestOtpFromUI = requestOtpFromUI;
    window.verifyOtpFromUI = verifyOtpFromUI;
    window.showEmailStep = showEmailStep;
    window.logout = logout;
    window.switchToView = switchToView;
    window.saveProfileData = saveProfileData;
    window.addIngredientRow = addIngredientRow;
    window.openIngredientSearchModal = openIngredientSearchModal;
    window.closeIngredientSearchModal = closeIngredientSearchModal;
    window.handleIngredientSearchModalInput = handleIngredientSearchModalInput;
    window.addCustomIngredientFromModal = addCustomIngredientFromModal;
    window.selectIngredientFromModal = selectIngredientFromModal;

    // Features: Fiche nutritionnelle IA & Suivi Macro individuel
    window.openMacroFoodPicker = openMacroFoodPicker;
    window.openNewAlimentModal = openNewAlimentModal;
    window.closeNewAlimentModal = closeNewAlimentModal;
    window.togglePoidsRefField = togglePoidsRefField;
    window.toggleNewAlimentLogQty = toggleNewAlimentLogQty;
    window.analyzeNutritionLabel = analyzeNutritionLabel;
    window.submitNewAliment = submitNewAliment;
    window.openConsumeFoodQtyModal = openConsumeFoodQtyModal;
    window.closeConsumeFoodQtyModal = closeConsumeFoodQtyModal;
    window.submitConsumeFoodQty = submitConsumeFoodQty;
    window.openRapportChartModal = openRapportChartModal;
    window.closeRapportChartModal = closeRapportChartModal;
    window.renderRapportChart = renderRapportChart;
    window.updateRapportWeightAndFat = updateRapportWeightAndFat;

    let otpTimerInterval = null;

    function showEmailStep() {
        document.getElementById('login-step-email').classList.remove('hidden');
        document.getElementById('login-step-otp').classList.add('hidden');
        document.getElementById('login-otp').value = "";
        if (otpTimerInterval) clearInterval(otpTimerInterval);
    }

    async function requestOtpFromUI() {
        const emailInput = document.getElementById('login-email');
        const email = emailInput.value.trim().toLowerCase();
        
        if (!email || !email.includes("@")) {
            alert("Veuillez saisir une adresse e-mail valide.");
            return;
        }

        const btn = document.getElementById('btn-request-otp');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Envoi...';
        lucide.createIcons();

        try {
            const res = await fetch(`${N8N_URL}/webhook/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });
            const data = await res.json();
            
            if (data.success) {
                document.getElementById('login-step-email').classList.add('hidden');
                document.getElementById('login-step-otp').classList.remove('hidden');
                startOtpTimer(600); // 10 minutes
                showNotification("Code envoyé par e-mail !", "success");
            } else {
                alert(data.error || "Adresse e-mail non autorisée.");
            }
        } catch (e) {
            console.error(e);
            alert("Erreur de connexion avec le serveur.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
            lucide.createIcons();
        }
    }

    function startOtpTimer(durationSeconds) {
        if (otpTimerInterval) clearInterval(otpTimerInterval);
        let timeRemaining = durationSeconds;
        const timerEl = document.getElementById('otp-timer');
        
        function updateTimer() {
            const minutes = Math.floor(timeRemaining / 60);
            const seconds = timeRemaining % 60;
            timerEl.innerText = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            if (timeRemaining <= 0) {
                clearInterval(otpTimerInterval);
                timerEl.innerText = "EXPIRÉ";
                alert("Votre code a expiré. Veuillez recommencer.");
                showEmailStep();
            }
            timeRemaining--;
        }
        
        updateTimer();
        otpTimerInterval = setInterval(updateTimer, 1000);
    }

    async function verifyOtpFromUI() {
        const email = document.getElementById('login-email').value.trim().toLowerCase();
        const code = document.getElementById('login-otp').value.trim();
        
        if (code.length !== 6 || isNaN(code)) {
            alert("Veuillez saisir le code à 6 chiffres.");
            return;
        }

        const btn = document.getElementById('btn-verify-otp');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Vérification...';
        lucide.createIcons();

        try {
            const res = await fetch(`${N8N_URL}/webhook/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, code: code })
            });
            const data = await res.json();
            
            if (data.success && data.user) {
                if (otpTimerInterval) clearInterval(otpTimerInterval);
                
                localStorage.setItem('fitbuddy_email', email);
                localStorage.setItem('fitbuddy_user_name', data.user.nom || "Utilisateur");
                localStorage.setItem('fitbuddy_user_profile', JSON.stringify(data.user));
                updateGroupData(data.user);
                
                userEmail = email;
                storedName = data.user.nom || "Utilisateur";
                
                document.getElementById('login-overlay').style.display = 'none';
                updateUserNameUI(data.user.surnom || storedName);
                showNotification(`Ravi de te revoir, ${data.user.surnom || storedName} !`, "success");
                
                showView('view-chat');
            } else {
                alert(data.error || "Code de validation incorrect ou expiré.");
            }
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la vérification du code.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
            lucide.createIcons();
        }
    }

    async function checkAuth() {
        const overlay = document.getElementById('login-overlay');
        if (!userEmail) {
            if (overlay) {
                overlay.style.display = 'flex';
                showEmailStep();
            }
        } else {
            if (overlay) overlay.style.display = 'none';
            if (document.getElementById('system-status')) {
                document.getElementById('system-status').innerText = `Connecté : ${userEmail}`;
            }
            
            // Background refresh of the profile
            try {
                const cachedProfile = stringToJson(localStorage.getItem('fitbuddy_user_profile'));
                if (cachedProfile) {
                    updateUserNameUI(cachedProfile.surnom || cachedProfile.nom || storedName || "Utilisateur");
                } else {
                    updateUserNameUI(storedName || "Utilisateur");
                }
                
                fetch(`${N8N_URL}/webhook/get-profile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
                    body: JSON.stringify({ email: userEmail })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.user) {
                        localStorage.setItem('fitbuddy_user_profile', JSON.stringify(data.user));
                        localStorage.setItem('fitbuddy_user_name', data.user.nom || "Utilisateur");
                        updateUserNameUI(data.user.surnom || data.user.nom || "Utilisateur");
                        updateGroupData(data.user);
                    }
                }).catch(() => {});
            } catch(e) {
                updateUserNameUI(storedName || "Utilisateur");
            }
        }
    }

    function stringToJson(str) { try { return JSON.parse(str); } catch(e) { return null; } }

    function switchToView(viewId) {
        showView(viewId);
        if (viewId === 'view-profile') {
            switchToProfile();
        }
    }

    function switchToProfile() {
        moveToHeader("agent-avatar.mp4");
        showView('view-profile');
        const container = document.getElementById('view-profile');
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full gap-3 text-cyan-400 text-xs tracking-widest uppercase animate-pulse">
                <i data-lucide="loader" class="w-5 h-5 animate-spin"></i>
                <span>Chargement du profil...</span>
            </div>`;
        lucide.createIcons();

        fetch(`${N8N_URL}/webhook/get-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
            body: JSON.stringify({ email: userEmail })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.user) {
                localStorage.setItem('fitbuddy_user_profile', JSON.stringify(data.user));
                localStorage.setItem('fitbuddy_user_name', data.user.nom || "Utilisateur");
                updateUserNameUI(data.user.surnom || data.user.nom || "Utilisateur");
                updateGroupData(data.user);
                renderProfileUI(data.user);
            } else {
                const cached = stringToJson(localStorage.getItem('fitbuddy_user_profile'));
                if (cached) renderProfileUI(cached);
                else container.innerHTML = `<p class="text-xs text-red-400 text-center p-4">Erreur lors de la récupération du profil.</p>`;
            }
        })
        .catch(err => {
            console.error(err);
            const cached = stringToJson(localStorage.getItem('fitbuddy_user_profile'));
            if (cached) renderProfileUI(cached);
            else container.innerHTML = `<p class="text-xs text-red-400 text-center p-4">Erreur de connexion réseau.</p>`;
        });
    }

    function renderProfileUI(user) {
        const container = document.getElementById('view-profile');
        if (!container) return;

        const membresRaw = user.membres_groupe || user.membresGroupe || "";
        currentGroupName = user.nom_groupe || user.nomGroupe || "";
        currentGroupMembers = typeof membresRaw === 'string' 
            ? membresRaw.split(',').map(s => s.trim()).filter(Boolean)
            : (Array.isArray(membresRaw) ? membresRaw : []);

        const nickname = user.surnom || user.nom || "Utilisateur";
        const name = user.nom || "";
        const email = user.email || userEmail;
        const sportGoal = user.objectif_sportif || "Maintien";
        const kcal = user.objectif_calorique || 2000;
        const prot = user.objectif_proteines || 150;
        const glu = user.objectif_glucides || 200;
        const lip = user.objectif_lipides || 70;
        const water = user.objectif_hydratation || 2.5;
        const agentBehavior = user.comportement_agent || "";
        
        let birthDateVal = "";
        const rawBirth = user.date_anniversaire || user.date_naissance || user.date_de_naissance || user.property_date_anniversaire || user.birthday || "";
        if (rawBirth) {
            if (typeof rawBirth === 'string') {
                birthDateVal = rawBirth.substring(0, 10);
            } else if (rawBirth.start) {
                birthDateVal = rawBirth.start.substring(0, 10);
            }
        }

        const allergies = Array.isArray(user.allergies) ? user.allergies : (user.allergies ? String(user.allergies).split(',').map(s=>s.trim()).filter(Boolean) : []);
        const dislikes = Array.isArray(user.aversions) ? user.aversions : (user.aversions ? String(user.aversions).split(',').map(s=>s.trim()).filter(Boolean) : []);

        const metricLabels = {
            "poids": { label: "Poids", unit: "kg" },
            "taille": { label: "Taille", unit: "cm" },
            "masse_grasse": { label: "Masse Grasse", unit: "%" },
            "masse_musculaire": { label: "Masse Muscl.", unit: "kg" },
            "graisse_viscerale": { label: "Graisse Visc.", unit: "idx" },
            "tour_de_cou": { label: "Tour de Cou", unit: "cm" },
            "tour_epaules": { label: "Tour Épaules", unit: "cm" },
            "tour_de_poitrine": { label: "Tour Poitrine", unit: "cm" },
            "tour_bras_droit": { label: "Bras Droit", unit: "cm" },
            "tour_bras_gauche": { label: "Bras Gauche", unit: "cm" },
            "tour_de_taille": { label: "Tour Taille", unit: "cm" },
            "tour_de_hanche": { label: "Tour Hanche", unit: "cm" },
            "tour_cuisse_droite": { label: "Cuisse Droite", unit: "cm" },
            "tour_cuisse_gauche": { label: "Cuisse Gauche", unit: "cm" },
            "tour_mollet_droit": { label: "Mollet Droit", unit: "cm" },
            "tour_mollet_gauche": { label: "Mollet Gauche", unit: "cm" }
        };

        const bodyMetric = user.type_objectif_corporel || "poids";
        const bodyInitial = parseFloat(user.objectif_corporel_initial || 0);
        const bodyTarget = parseFloat(user.objectif_corporel_but || 0);
        let mensurations = {};
        const rawMens = user.mensurations || user.Mensurations || user.mensuration || user.Mensuration || user.mesures || {};
        if (rawMens) {
            if (typeof rawMens === 'string') {
                try {
                    mensurations = JSON.parse(rawMens);
                } catch(e) {
                    console.error("Error parsing mensurations string:", e);
                }
            } else if (Array.isArray(rawMens)) {
                mensurations = rawMens.reduce((acc, curr) => ({...acc, ...curr}), {});
            } else if (typeof rawMens === 'object') {
                mensurations = rawMens;
            }
        }
        // Fallback: if mensurations is empty, check if metrics are defined flat on the user object (case-insensitive)
        if (Object.keys(mensurations).length === 0) {
            Object.keys(metricLabels).forEach(key => {
                const foundKey = Object.keys(user).find(k => k.toLowerCase() === key.toLowerCase());
                if (foundKey && user[foundKey] !== undefined && user[foundKey] !== null) {
                    mensurations[key] = user[foundKey];
                }
            });
        }
        const bodyCurrent = parseFloat(mensurations[bodyMetric] !== undefined && mensurations[bodyMetric] !== null ? mensurations[bodyMetric] : (user.objectif_corporel_actuel || bodyInitial));
        
        
        let progressPercent = 0;
        if (bodyInitial !== bodyTarget) {
            const totalDistance = Math.abs(bodyTarget - bodyInitial);
            const currentDistance = Math.abs(bodyCurrent - bodyInitial);
            if (totalDistance > 0) {
                progressPercent = Math.min(100, Math.max(0, Math.round((currentDistance / totalDistance) * 100)));
            }
        } else {
            progressPercent = bodyCurrent === bodyTarget ? 100 : 0;
        }

        const sportGoalOptions = [
            "Hypertrophie (prise de muscle)",
            "Bulk (prise de masse)",
            "Cut (sèche)",
            "Maintien",
            "Recomp (recomposition corporelle)",
            "Force",
            "Endurance / Conditionnement"
        ];

        const bodyGoalMetricOptions = [
            "poids",
            "taille",
            "masse_grasse",
            "masse_musculaire",
            "graisse_viscerale",
            "tour_de_cou",
            "tour_epaules",
            "tour_de_poitrine",
            "tour_bras_droit",
            "tour_bras_gauche",
            "tour_de_taille",
            "tour_de_hanche",
            "tour_cuisse_droite",
            "tour_cuisse_gauche",
            "tour_mollet_droit",
            "tour_mollet_gauche"
        ];

        container.innerHTML = `
            <div class="p-2 space-y-6 pb-24 animate-in fade-in duration-500 overflow-y-auto no-scrollbar h-full">
                <!-- Header Profil -->
                <div class="category-badge mb-2">
                    <i data-lucide="user" class="w-3.5 h-3.5 text-cyan-400"></i>
                    <h2 class="text-[10px] font-black text-white uppercase tracking-[0.15em]">Mon Profil FitBuddy</h2>
                </div>
                
                <!-- Carte Identité -->
                <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 shadow-xl">
                    <div class="flex items-center gap-4">
                        <div onclick="document.getElementById('profile-photo-input').click()" class="cursor-pointer relative w-14 h-14 rounded-2xl overflow-hidden border border-white/10 bg-white/5 group shadow-lg flex items-center justify-center">
                            ${(user.photo_profil || user.photoProfil) ? `<img id="profile-preview-img" src="${(user.photo_profil || user.photoProfil).startsWith('http') || (user.photo_profil || user.photoProfil).startsWith('data:') || (user.photo_profil || user.photoProfil).startsWith('images/') ? (user.photo_profil || user.photoProfil) : 'images/profils/' + (user.photo_profil || user.photoProfil)}" class="w-full h-full object-cover">` : `<img id="profile-preview-img" class="hidden w-full h-full object-cover"><div id="profile-fallback-avatar" class="w-full h-full flex items-center justify-center bg-cyan-500/10 text-cyan-400 font-black text-xl">${nickname.charAt(0).toUpperCase()}</div>`}
                            <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <i data-lucide="camera" class="w-4 h-4 text-white"></i>
                            </div>
                        </div>
                        <div>
                            <h3 class="text-sm font-black text-white tracking-tight">${nickname}</h3>
                            <p class="text-[10px] text-white/40">${email}</p>
                        </div>
                    </div>
                    
                    <div class="space-y-1 pt-2">
                        <label class="text-[9px] font-bold text-white/40 uppercase ml-1">Pseudo</label>
                        <input type="text" id="prof-nickname" value="${nickname}" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500">
                    </div>
                    <div class="space-y-1.5 pt-1">
                        <label class="text-[9px] font-bold text-white/40 uppercase ml-1">Ou choisir un avatar rapide</label>
                        <div class="flex gap-2.5 overflow-x-auto no-scrollbar py-1">
                            ${[
                                { name: "💪 Fit", url: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=150&auto=format&fit=crop&q=60" },
                                { name: "🍳 Chef", url: "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=150&auto=format&fit=crop&q=60" },
                                { name: "🧘 Zen", url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=150&auto=format&fit=crop&q=60" },
                                { name: "⚡ Power", url: "https://images.unsplash.com/photo-1605296867304-46d5465a25f1?w=150&auto=format&fit=crop&q=60" }
                            ].map(av => `
                                <button type="button" onclick="selectQuickAvatar('${av.url}')" class="flex-none w-10 h-10 rounded-xl overflow-hidden border border-white/10 hover:border-cyan-400 active:scale-95 transition-all">
                                    <img src="${av.url}" class="w-full h-full object-cover" title="${av.name}">
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="space-y-1 pt-2">
                        <label class="text-[9px] font-bold text-white/40 uppercase ml-1">Date de naissance</label>
                        <input type="date" id="prof-birth-date" value="${birthDateVal}" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500">
                    </div>
                </div>

                <!-- Widget Objectif Corporel -->
                <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-5 shadow-xl relative overflow-hidden">
                    <div class="flex justify-between items-center border-b border-white/10 pb-3">
                        <div class="flex items-center gap-2">
                            <i data-lucide="target" class="w-4 h-4 text-purple-400 animate-pulse"></i>
                            <h4 class="text-xs font-black text-white uppercase tracking-wider">Objectif Corporel</h4>
                        </div>
                        <span class="text-[9px] font-black text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">${progressPercent}%</span>
                    </div>

                    <div class="space-y-3">
                        <div class="space-y-1">
                            <label class="text-[9px] font-bold text-white/40 uppercase ml-1">Métrique de l'Objectif</label>
                            <select id="prof-body-metric" onchange="window.onBodyMetricChange()" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-cyan-400 font-bold outline-none cursor-pointer">
                                ${bodyGoalMetricOptions.map(m => {
                                    const label = metricLabels[m] ? `${metricLabels[m].label} (${metricLabels[m].unit})` : m;
                                    return `<option value="${m}" ${m === bodyMetric ? 'selected' : ''} class="bg-[#111] text-white">${label}</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="space-y-1">
                                <label class="text-[9px] font-bold text-white/40 uppercase ml-1">Départ</label>
                                <input type="number" id="prof-body-initial" value="${bodyInitial}" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white/50 font-bold outline-none text-center" disabled>
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-bold text-cyan-400 uppercase ml-1">Actuel (Pesée)</label>
                                <input type="number" id="prof-body-current" value="${bodyCurrent}" step="0.1" oninput="window.syncMetricToGrid()" class="w-full bg-white/5 border border-cyan-500/30 rounded-xl p-2.5 text-xs text-cyan-400 font-black outline-none focus:border-cyan-500 text-center">
                            </div>
                            <div class="space-y-1">
                                <label class="text-[9px] font-bold text-purple-400 uppercase ml-1">But (Cible)</label>
                                <input type="number" id="prof-body-target" value="${bodyTarget}" step="0.1" class="w-full bg-white/5 border border-purple-500/30 rounded-xl p-2.5 text-xs text-purple-400 font-bold outline-none focus:border-purple-500 text-center">
                            </div>
                        </div>
                    </div>

                    <!-- Jauge de progression -->
                    <div class="space-y-2 pt-1">
                        <div class="progress-track">
                            <div class="progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                        <p class="text-[8px] text-white/30 italic text-center leading-normal">Modifier votre valeur actuelle créera automatiquement une nouvelle pesée du jour dans Notion !</p>
                    </div>
                </div>

                <!-- Widget Toutes les Mensurations -->
                <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 shadow-xl">
                    <div class="flex items-center gap-2 border-b border-white/10 pb-3">
                        <i data-lucide="scale" class="w-4 h-4 text-cyan-400 animate-pulse"></i>
                        <h4 class="text-xs font-black text-white uppercase tracking-wider">Toutes mes Mensurations</h4>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3 pt-1">
                        ${Object.keys(metricLabels).map(key => {
                            const val = mensurations[key] !== undefined && mensurations[key] !== null ? mensurations[key] : "";
                            const isTarget = key === bodyMetric;
                            return `
                                <div class="space-y-1">
                                    <label class="text-[8px] font-bold ${isTarget ? 'text-cyan-400' : 'text-white/40'} uppercase ml-1">${metricLabels[key].label} (${metricLabels[key].unit})</label>
                                    <input type="number" id="m-${key}" step="0.1" value="${val}" oninput="window.syncMetricFromGrid('${key}')" class="w-full bg-white/5 ${isTarget ? 'border-cyan-500/30 text-cyan-400 font-black' : 'border-white/10 text-white'} rounded-xl p-2 text-xs outline-none focus:border-cyan-500 text-center">
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- Objectifs Nutrition & Hydratation -->
                <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 shadow-xl">
                    <div class="flex items-center gap-2 border-b border-white/10 pb-3">
                        <i data-lucide="dumbbell" class="w-4 h-4 text-cyan-400"></i>
                        <h4 class="text-xs font-black text-white uppercase tracking-wider">Objectif Sportif & Nutrition</h4>
                    </div>

                    <div class="space-y-1">
                        <label class="text-[9px] font-bold text-white/40 uppercase ml-1">Objectif Sportif</label>
                        <select id="prof-sport-goal" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white font-bold outline-none cursor-pointer">
                            ${sportGoalOptions.map(g => `<option value="${g}" ${g === sportGoal ? 'selected' : ''} class="bg-[#111] text-white">${g}</option>`).join('')}
                        </select>
                    </div>

                    <div class="grid grid-cols-2 gap-3 pt-2">
                        <div class="space-y-1">
                            <label class="text-[9px] font-bold text-[#f97316] uppercase ml-1">Calories (kcal)</label>
                            <input type="number" id="prof-kcal" value="${kcal}" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-[#f97316] font-bold outline-none focus:border-[#f97316]">
                        </div>
                        <div class="space-y-1">
                            <label class="text-[9px] font-bold text-[#3b82f6] uppercase ml-1">Protéines (g)</label>
                            <input type="number" id="prof-prot" value="${prot}" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-[#3b82f6] font-bold outline-none focus:border-[#3b82f6]">
                        </div>
                        <div class="space-y-1">
                            <label class="text-[9px] font-bold text-[#22c55e] uppercase ml-1">Glucides (g)</label>
                            <input type="number" id="prof-glu" value="${glu}" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-[#22c55e] font-bold outline-none focus:border-[#22c55e]">
                        </div>
                        <div class="space-y-1">
                            <label class="text-[9px] font-bold text-[#ef4444] uppercase ml-1">Lipides (g)</label>
                            <input type="number" id="prof-lip" value="${lip}" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-[#ef4444] font-bold outline-none focus:border-[#ef4444]">
                        </div>
                    </div>

                    <div class="space-y-1 pt-1">
                        <label class="text-[9px] font-bold text-cyan-400 uppercase ml-1">Objectif Hydratation (L/jour)</label>
                        <input type="number" id="prof-water" value="${water}" step="0.1" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-cyan-400 font-bold outline-none focus:border-cyan-500">
                    </div>
                </div>

                <!-- Préférences Alimentaires (Allergies & Aversions) -->
                <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 shadow-xl">
                    <div class="flex items-center gap-2 border-b border-white/10 pb-3">
                        <i data-lucide="chef-hat" class="w-4 h-4 text-amber-500"></i>
                        <h4 class="text-xs font-black text-white uppercase tracking-wider">Préférences Alimentaires</h4>
                    </div>

                    <!-- Allergies -->
                    <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <label class="text-[9px] font-bold text-red-400 uppercase ml-1">Allergies (multi-sélect)</label>
                            <button id="btn-add-allergy" class="text-[9px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1 active:scale-95 transition-transform"><i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Ajouter</button>
                        </div>
                        <div id="prof-allergies-container" class="flex flex-wrap gap-2 min-h-6">
                            ${allergies.length > 0 ? allergies.map(a => `<span class="tag-chip tag-chip-allergy cursor-pointer" onclick="this.remove()"># ${a} <i data-lucide="x" class="w-3 h-3 text-red-400/60 ml-1"></i></span>`).join('') : '<span class="text-[10px] text-white/20 italic">Aucune allergie</span>'}
                        </div>
                    </div>

                    <!-- Aversions -->
                    <div class="space-y-2 pt-2">
                        <div class="flex justify-between items-center">
                            <label class="text-[9px] font-bold text-amber-500 uppercase ml-1">N'aime pas manger</label>
                            <button id="btn-add-aversion" class="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1 active:scale-95 transition-transform"><i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Ajouter</button>
                        </div>
                        <div id="prof-aversions-container" class="flex flex-wrap gap-2 min-h-6">
                            ${dislikes.length > 0 ? dislikes.map(d => `<span class="tag-chip tag-chip-aversion cursor-pointer" onclick="this.remove()"># ${d} <i data-lucide="x" class="w-3 h-3 text-amber-500/60 ml-1"></i></span>`).join('') : '<span class="text-[10px] text-white/20 italic">Aucune aversion</span>'}
                        </div>
                    </div>
                </div>

                <!-- Comportement de l'Agent -->
                <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 shadow-xl">
                    <div class="flex items-center gap-2 border-b border-white/10 pb-3">
                        <i data-lucide="sparkles" class="w-4 h-4 text-purple-400 animate-pulse"></i>
                        <h4 class="text-xs font-black text-white uppercase tracking-wider">Personnalité de l'Agent</h4>
                    </div>
                    <div class="space-y-1">
                        <label class="text-[9px] font-bold text-white/40 uppercase ml-1">Comment Tyler doit-il se comporter ?</label>
                        <textarea id="prof-behavior" rows="3" placeholder="Ex: Sois direct, dynamique, utilise le tutoiement..." class="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-xs text-white outline-none focus:border-cyan-500 resize-none font-medium leading-relaxed">${agentBehavior}</textarea>
                    </div>
                </div>

                <!-- Mon groupe d'utilisateurs -->
                <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 shadow-xl">
                    <div class="flex items-center gap-2 border-b border-white/10 pb-3">
                        <i data-lucide="users" class="w-4 h-4 text-cyan-400"></i>
                        <h4 class="text-xs font-black text-white uppercase tracking-wider">Mon groupe d'utilisateurs</h4>
                    </div>
                    <div class="space-y-2">
                        <label class="text-[9px] font-bold text-white/40 uppercase ml-1">Nom du groupe d'utilisateurs</label>
                        <input type="text" id="profile-group-name" value="${currentGroupName}" placeholder="Ex: Groupe Steyre" class="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500 placeholder-white/20">
                    </div>
                    <div class="space-y-2 pt-2">
                        <div class="flex justify-between items-center">
                            <label class="text-[9px] font-bold text-cyan-400 uppercase ml-1">membres (adresse e-mail)</label>
                            <button type="button" onclick="window.addGroupMemberTag()" class="text-[9px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1 active:scale-95 transition-transform"><i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Ajouter</button>
                        </div>
                        <div class="flex gap-2">
                            <input type="email" id="new-group-member-email" placeholder="membre@exemple.com" class="flex-1 bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500 placeholder-white/20">
                        </div>
                        <div id="group-members-tags" class="flex flex-wrap gap-2 pt-2 min-h-6">
                            <!-- Rempli dynamiquement en JS -->
                        </div>
                    </div>
                </div>

                <!-- Actions du Profil -->
                <div class="space-y-3 pt-4">
                    <button onclick="saveProfileData()" id="btn-save-profile" class="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 py-4 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all border border-cyan-400/20">
                        <i data-lucide="save" class="w-4 h-4"></i> Enregistrer les modifications
                    </button>
                    
                    <button onclick="logout()" class="w-full bg-red-950/20 hover:bg-red-950/40 border border-red-500/10 py-3.5 rounded-2xl text-xs font-black text-red-400 uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
                        <i data-lucide="log-out" class="w-4 h-4"></i> Se déconnecter de la session
                    </button>
                </div>
            </div>
        `;
        
        try {
            if (window.lucide) lucide.createIcons();
        } catch(e) {
            console.error(e);
        }

        const addAllergyBtn = document.getElementById('btn-add-allergy');
        if (addAllergyBtn) {
            addAllergyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.addAllergyTag();
            });
        }

        const addAversionBtn = document.getElementById('btn-add-aversion');
        if (addAversionBtn) {
            addAversionBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.addAversionTag();
            });
        }

        window.renderGroupMembersTags = function() {
            const container = document.getElementById('group-members-tags');
            if (!container) return;
            
            if (currentGroupMembers.length === 0) {
                container.innerHTML = '<span class="text-[10px] text-white/20 italic">Aucun membre</span>';
                return;
            }
            
            container.innerHTML = currentGroupMembers.map((email, idx) => `
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold">
                    ${email}
                    <button type="button" onclick="window.removeGroupMember(${idx})" class="w-3.5 h-3.5 rounded-full bg-red-500/10 hover:bg-red-500 hover:text-black flex items-center justify-center text-red-400 text-[8px] transition-all">
                        ✕
                    </button>
                </span>
            `).join('');
            if (window.lucide) lucide.createIcons();
        };

        window.addGroupMemberTag = function() {
            const input = document.getElementById('new-group-member-email');
            if (!input) return;
            const email = input.value.trim().toLowerCase();
            
            if (!email || !email.includes('@')) {
                alert("⚠️ Veuillez saisir une adresse e-mail valide.");
                return;
            }
            
            if (currentGroupMembers.includes(email)) {
                alert("⚠️ Cet utilisateur est déjà présent dans la liste.");
                return;
            }
            
            currentGroupMembers.push(email);
            input.value = "";
            window.renderGroupMembersTags();
        };

        window.removeGroupMember = function(idx) {
            currentGroupMembers.splice(idx, 1);
            window.renderGroupMembersTags();
        };
        
        // Premier rendu
        setTimeout(() => { window.renderGroupMembersTags(); }, 50);
    }

    function showCustomPrompt(title, placeholder, callback) {
        // Supprimer toute modale existante
        const existing = document.getElementById('custom-prompt-modal-dynamic');
        if (existing) existing.remove();

        // Créer l'overlay de la modale dynamique
        const modal = document.createElement('div');
        modal.id = 'custom-prompt-modal-dynamic';
        modal.className = 'fixed inset-0 z-[25000] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300';
        modal.style.display = 'flex';

        modal.innerHTML = `
            <div class="bg-[#111] border border-white/10 w-full max-w-xs rounded-3xl p-6 space-y-5 shadow-2xl relative animate-in zoom-in-95 duration-300">
                <button id="btn-custom-prompt-close" class="absolute top-4 right-4 w-8 h-8 bg-white/5 rounded-full flex items-center justify-center border border-white/5">
                    <i data-lucide="x" class="w-4 h-4 text-white/60"></i>
                </button>
                
                <div class="text-center space-y-1">
                    <div class="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto mb-2">
                        <i data-lucide="plus-circle" class="w-5 h-5"></i>
                    </div>
                    <h4 class="text-white font-black text-xs uppercase tracking-widest">${title}</h4>
                    <p class="text-[9px] text-white/40 uppercase tracking-widest">Saisie rapide</p>
                </div>

                <div class="space-y-4">
                    <input type="text" id="custom-prompt-input-dynamic" placeholder="${placeholder}" class="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-cyan-500 font-bold placeholder-white/20">
                    
                    <div class="flex gap-2">
                        <button id="btn-custom-prompt-cancel" class="flex-1 py-3 text-[10px] font-black text-white/40 uppercase tracking-widest">Annuler</button>
                        <button id="btn-custom-prompt-confirm-dynamic" class="flex-1 bg-cyan-500 py-3 rounded-xl text-[10px] font-black text-black uppercase tracking-widest shadow-lg shadow-cyan-500/20">Confirmer</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        if (window.lucide) {
            try {
                lucide.createIcons();
            } catch(e) {
                console.error(e);
            }
        }

        const input = document.getElementById('custom-prompt-input-dynamic');
        input.focus();

        const closeBtn = document.getElementById('btn-custom-prompt-close');
        const cancelBtn = document.getElementById('btn-custom-prompt-cancel');
        const confirmBtn = document.getElementById('btn-custom-prompt-confirm-dynamic');

        const destroyModal = () => {
            modal.remove();
        };

        closeBtn.onclick = destroyModal;
        cancelBtn.onclick = destroyModal;

        // Fermer la modale si on clique en dehors du contenu
        modal.onclick = function(e) {
            if (e.target === modal) {
                destroyModal();
            }
        };

        confirmBtn.onclick = function() {
            const val = input.value.trim();
            if (val) {
                callback(val);
                destroyModal();
            } else {
                alert("Veuillez saisir une valeur.");
            }
        };

        // Permettre la validation par Entrée
        input.onkeypress = function(e) {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        };
    }

    window.addAllergyTag = function() {
        showCustomPrompt("Ajouter une Allergie", "Ex: Lactose, Gluten...", function(val) {
            const container = document.getElementById('prof-allergies-container');
            if (!container) return;
            if (container.querySelector('span.italic') || container.innerHTML.includes("Aucune")) container.innerHTML = "";
            container.insertAdjacentHTML('beforeend', `<span class="tag-chip tag-chip-allergy cursor-pointer" onclick="this.remove()"># ${val} <i data-lucide="x" class="w-3 h-3 text-red-400/60 ml-1"></i></span>`);
            if (window.lucide) lucide.createIcons();
        });
    };

    window.addAversionTag = function() {
        showCustomPrompt("Ajouter une Aversion", "Ex: Brocoli, Coriandre...", function(val) {
            const container = document.getElementById('prof-aversions-container');
            if (!container) return;
            if (container.querySelector('span.italic') || container.innerHTML.includes("Aucune")) container.innerHTML = "";
            container.insertAdjacentHTML('beforeend', `<span class="tag-chip tag-chip-aversion cursor-pointer" onclick="this.remove()"># ${val} <i data-lucide="x" class="w-3 h-3 text-amber-500/60 ml-1"></i></span>`);
            if (window.lucide) lucide.createIcons();
        });
    };

    window.onBodyMetricChange = function() {
        const bodyMetric = document.getElementById('prof-body-metric').value;
        
        // Update main current input from the grid value
        const gridInput = document.getElementById(`m-${bodyMetric}`);
        const currentInput = document.getElementById('prof-body-current');
        if (gridInput && currentInput) {
            currentInput.value = gridInput.value;
        }
        
        // Dynamic highlight styles for the active body metric in the 16 measurements grid
        const metrics = [
            "poids", "taille", "masse_grasse", "masse_musculaire", "graisse_viscerale", 
            "tour_de_cou", "tour_epaules", "tour_de_poitrine", "tour_bras_droit", 
            "tour_bras_gauche", "tour_de_taille", "tour_de_hanche", "tour_cuisse_droite", 
            "tour_cuisse_gauche", "tour_mollet_droit", "tour_mollet_gauche"
        ];
        
        metrics.forEach(key => {
            const inputEl = document.getElementById(`m-${key}`);
            if (inputEl) {
                const labelEl = inputEl.previousElementSibling;
                if (key === bodyMetric) {
                    if (labelEl) labelEl.className = "text-[8px] font-bold text-cyan-400 uppercase ml-1";
                    inputEl.className = "w-full bg-white/5 border-cyan-500/30 text-cyan-400 font-black rounded-xl p-2 text-xs outline-none focus:border-cyan-500 text-center";
                } else {
                    if (labelEl) labelEl.className = "text-[8px] font-bold text-white/40 uppercase ml-1";
                    inputEl.className = "w-full bg-white/5 border border-white/10 text-white rounded-xl p-2 text-xs outline-none focus:border-cyan-500 text-center";
                }
            }
        });
    };

    window.syncMetricFromGrid = function(key) {
        const bodyMetric = document.getElementById('prof-body-metric').value;
        if (key === bodyMetric) {
            const val = document.getElementById(`m-${key}`).value;
            const mainCurrent = document.getElementById('prof-body-current');
            if (mainCurrent) mainCurrent.value = val;
        }
    };

    window.syncMetricToGrid = function() {
        const bodyMetric = document.getElementById('prof-body-metric').value;
        const val = document.getElementById('prof-body-current').value;
        const gridInput = document.getElementById(`m-${bodyMetric}`);
        if (gridInput) gridInput.value = val;
    };

    async function saveProfileData() {
        const btn = document.getElementById('btn-save-profile');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Enregistrement...';
        lucide.createIcons();

        const allergyTags = document.querySelectorAll('#prof-allergies-container span.tag-chip');
        const allergies = Array.from(allergyTags).map(el => el.innerText.replace('#', '').trim());

        const aversionTags = document.querySelectorAll('#prof-aversions-container span.tag-chip');
        const dislikes = Array.from(aversionTags).map(el => el.innerText.replace('#', '').trim());

        const metricsList = [
            "poids", "taille", "masse_grasse", "masse_musculaire", "graisse_viscerale", 
            "tour_de_cou", "tour_epaules", "tour_de_poitrine", "tour_bras_droit", 
            "tour_bras_gauche", "tour_de_taille", "tour_de_hanche", "tour_cuisse_droite", 
            "tour_cuisse_gauche", "tour_mollet_droit", "tour_mollet_gauche"
        ];
        
        const birthDateInput = document.getElementById('prof-birth-date');
        const birthDateVal = birthDateInput ? birthDateInput.value : "";

        const mensurationsPayload = {};
        mensurationsPayload["email"] = userEmail;
        mensurationsPayload["e_mail"] = userEmail;
        mensurationsPayload["e-mail"] = userEmail;
        mensurationsPayload["adresse_mail"] = userEmail;
        mensurationsPayload["userName"] = userEmail;

        if (birthDateVal) {
            mensurationsPayload["date_anniversaire"] = birthDateVal;
            mensurationsPayload["date_naissance"] = birthDateVal;
            mensurationsPayload["birthday"] = birthDateVal;
            mensurationsPayload["property_date_anniversaire"] = birthDateVal;
        } else {
            mensurationsPayload["date_anniversaire"] = null;
            mensurationsPayload["date_naissance"] = null;
            mensurationsPayload["birthday"] = null;
            mensurationsPayload["property_date_anniversaire"] = null;
        }

        metricsList.forEach(key => {
            const el = document.getElementById(`m-${key}`);
            if (el && el.value.trim() !== "") {
                mensurationsPayload[key] = parseFloat(el.value);
            } else {
                mensurationsPayload[key] = null;
            }
        });

        const cachedProfile = stringToJson(localStorage.getItem('fitbuddy_user_profile')) || {};
        
        let bodyCompositionChanged = false;
        metricsList.forEach(key => {
            const el = document.getElementById(`m-${key}`);
            if (el) {
                const newVal = el.value.trim() !== "" ? parseFloat(el.value) : null;
                let oldVal = null;
                if (cachedProfile.mensurations && cachedProfile.mensurations[key] !== undefined && cachedProfile.mensurations[key] !== null) {
                    oldVal = cachedProfile.mensurations[key];
                } else if (cachedProfile[key] !== undefined && cachedProfile[key] !== null) {
                    oldVal = cachedProfile[key];
                }
                
                const parsedNew = newVal !== null ? parseFloat(newVal) : 0;
                const parsedOld = oldVal !== null ? parseFloat(oldVal) : 0;
                
                if (parsedNew !== parsedOld) {
                    bodyCompositionChanged = true;
                }
            }
        });
        
        const oldGoal = cachedProfile.objectif_sportif || "";
        const newGoal = document.getElementById('prof-sport-goal').value || "";
        if (oldGoal !== newGoal) {
            bodyCompositionChanged = true;
        }

        const newWeight = parseFloat(mensurationsPayload.poids || 0);

        let calculatedKcal = parseFloat(document.getElementById('prof-kcal').value) || 0;
        let calculatedProt = parseFloat(document.getElementById('prof-prot').value) || 0;
        let calculatedGluc = parseFloat(document.getElementById('prof-glu').value) || 0;
        let calculatedLip = parseFloat(document.getElementById('prof-lip').value) || 0;

        if (bodyCompositionChanged && newWeight > 0) {
            const heightInput = document.getElementById('m-taille');
            const height = parseFloat(heightInput ? heightInput.value : "") || parseFloat(cachedProfile.mensurations?.taille) || 180;
            
            let age = 30;
            if (birthDateVal) {
                const birthYear = new Date(birthDateVal).getFullYear();
                const currentYear = new Date().getFullYear();
                if (!isNaN(birthYear)) {
                    age = currentYear - birthYear;
                }
            } else {
                age = parseFloat(cachedProfile.age || 30);
            }
            
            const activityCoeff = 1.375; // Active
            const BMR = 10 * newWeight + 6.25 * height - 5 * age + 5;
            const TDEE = Math.round(BMR * activityCoeff);
            
            const goal = document.getElementById('prof-sport-goal').value || "Maintien";
            let kcal = TDEE;
            
            if (goal.includes("Cut") || goal.includes("sèche")) kcal -= 500;
            else if (goal.includes("Bulk") || goal.includes("masse")) kcal += 350;
            else if (goal.includes("Hypertrophie")) kcal += 200;
            else if (goal.includes("Recomp")) kcal -= 200;

            const prot = Math.round(newWeight * 2.2);
            const lip = Math.round(newWeight * 0.9);
            const gluc = Math.round((kcal - (prot * 4 + lip * 9)) / 4);

            calculatedKcal = kcal;
            calculatedProt = prot;
            calculatedGluc = gluc;
            calculatedLip = lip;

            // Sync with profile form inputs so they reflect the change instantly
            const kcalEl = document.getElementById('prof-kcal');
            const protEl = document.getElementById('prof-prot');
            const gluEl = document.getElementById('prof-glu');
            const lipEl = document.getElementById('prof-lip');
            
            if (kcalEl) kcalEl.value = kcal;
            if (protEl) protEl.value = prot;
            if (gluEl) gluEl.value = gluc;
            if (lipEl) lipEl.value = lip;
        }

        const groupNameInput = document.getElementById('profile-group-name');
        const finalGroupName = groupNameInput ? groupNameInput.value.trim() : "";
        
        // Récupérer une adresse éventuellement en cours de saisie dans le champ de membre
        const newMemberEmailInput = document.getElementById('new-group-member-email');
        if (newMemberEmailInput) {
            const rawEmail = newMemberEmailInput.value.trim().toLowerCase();
            if (rawEmail && rawEmail.includes('@')) {
                if (!currentGroupMembers.map(m => m.trim().toLowerCase()).includes(rawEmail)) {
                    currentGroupMembers.push(rawEmail);
                }
                newMemberEmailInput.value = ""; // Vider le champ après capture
            }
        }

        // Notre adresse e-mail s'ajoute automatiquement au groupe si un nom de groupe est présent
        if (finalGroupName) {
            const normalizedEmail = (userEmail || "").trim().toLowerCase();
            if (normalizedEmail && !currentGroupMembers.map(m => m.trim().toLowerCase()).includes(normalizedEmail)) {
                currentGroupMembers.push(normalizedEmail);
            }
        }
        
        const finalGroupMembers = currentGroupMembers.join(', ');

        const profileImgEl = document.getElementById('profile-preview-img');
        let profilePhotoUploadPayload = null;
        let profilePhotoFilename = "";

        if (profileImgEl && profileImgEl.dataset.base64) {
            const ext = profileImgEl.dataset.extension || 'jpg';
            profilePhotoFilename = `profile-${userEmail.replace(/[^a-z0-9]/g, '-')}-${Date.now()}.${ext}`;
            profilePhotoUploadPayload = { base64: profileImgEl.dataset.base64, filename: profilePhotoFilename };
        }

        const payload = {
            email: userEmail,
            surnom: document.getElementById('prof-nickname').value.trim(),
            photo_profil: profilePhotoFilename ? `images/profils/${profilePhotoFilename}` : (profileImgEl ? profileImgEl.src : ""),
            photoUploadPayload: profilePhotoUploadPayload,
            date_anniversaire: birthDateVal || null,
            date_naissance: birthDateVal || null,
            birthday: birthDateVal || null,
            property_date_anniversaire: birthDateVal || null,
            objectif_sportif: document.getElementById('prof-sport-goal').value,
            objectif_calorique: calculatedKcal,
            objectif_proteines: calculatedProt,
            objectif_glucides: calculatedGluc,
            objectif_lipides: calculatedLip,
            objectif_hydratation: parseFloat(document.getElementById('prof-water').value) || 0,
            allergies: allergies,
            aversions: dislikes,
            comportement_agent: document.getElementById('prof-behavior').value.trim(),
            type_objectif_corporel: document.getElementById('prof-body-metric').value,
            objectif_corporel_actuel: parseFloat(document.getElementById('prof-body-current').value) || 0,
            objectif_corporel_but: parseFloat(document.getElementById('prof-body-target').value) || 0,
            weight_or_fat_changed: bodyCompositionChanged,
            body_composition_changed: bodyCompositionChanged,
            nom_groupe: finalGroupName,
            membres_groupe: finalGroupMembers,
            mensurations: mensurationsPayload
        };

        try {
            const res = await fetch(`${N8N_URL}/webhook/update-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.success) {
                const cached = stringToJson(localStorage.getItem('fitbuddy_user_profile')) || {};
                
                // Merge response macro estimations if present (recalculated by backend/Tyler)
                const finalKcal = data.objectif_calorique !== undefined ? parseFloat(data.objectif_calorique) : payload.objectif_calorique;
                const finalProt = data.objectif_proteines !== undefined ? parseFloat(data.objectif_proteines) : payload.objectif_proteines;
                const finalGluc = data.objectif_glucides !== undefined ? parseFloat(data.objectif_glucides) : payload.objectif_glucides;
                const finalLip = data.objectif_lipides !== undefined ? parseFloat(data.objectif_lipides) : payload.objectif_lipides;

                const updatedProfile = { 
                    ...cached, 
                    ...payload,
                    objectif_calorique: finalKcal,
                    objectif_proteines: finalProt,
                    objectif_glucides: finalGluc,
                    objectif_lipides: finalLip
                };
                
                // Update UI input values with final values
                const kcalEl = document.getElementById('prof-kcal');
                const protEl = document.getElementById('prof-prot');
                const gluEl = document.getElementById('prof-glu');
                const lipEl = document.getElementById('prof-lip');
                
                if (kcalEl && data.objectif_calorique !== undefined) kcalEl.value = finalKcal;
                if (protEl && data.objectif_proteines !== undefined) protEl.value = finalProt;
                if (gluEl && data.objectif_glucides !== undefined) gluEl.value = finalGluc;
                if (lipEl && data.objectif_lipides !== undefined) lipEl.value = finalLip;

                localStorage.setItem('fitbuddy_user_profile', JSON.stringify(updatedProfile));
                localStorage.setItem('fitbuddy_user_name', payload.surnom || storedName);
                updateUserNameUI(payload.surnom || storedName);
                updateGroupData(updatedProfile);

                if (data.tyler_note) {
                    localStorage.setItem('fitbuddy_tyler_metabolic_note', data.tyler_note);
                } else if (data.tyler_explanation) {
                    localStorage.setItem('fitbuddy_tyler_metabolic_note', data.tyler_explanation);
                } else {
                    localStorage.removeItem('fitbuddy_tyler_metabolic_note');
                }
                
                showNotification("Profil Notion mis à jour avec succès !", "success");
                switchToProfile(); 
            } else {
                alert(data.error || "Impossible de mettre à jour le profil.");
            }
        } catch (e) {
            console.error(e);
            alert("Erreur réseau lors de la mise à jour du profil.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
            lucide.createIcons();
        }
    }

    function logout() {
        localStorage.clear();
        userEmail = null;
        storedName = null;
        location.reload();
    }

    document.getElementById('macro-user-select')

    function updateUserNameUI(name) {
        const el = document.getElementById('current-user-name');
        if (el) { el.innerHTML = `${name} <i data-lucide="chevron-down" class="w-3 h-3 text-white/40"></i>`; lucide.createIcons(); }
    }

    function toggleUserDropdown() {
        const dd = document.getElementById('user-dropdown');
        dd.style.display = (dd.style.display === 'block') ? 'none' : 'block';
    }

    async function selectUser(name) {
        localStorage.setItem('fitbuddy_user_name', name);
        updateUserNameUI(name); 
        toggleUserDropdown();
        const chat = document.getElementById('chat');
        if (chat) {
            chat.innerHTML = `<div class="msg-agent p-4 max-w-[90%] shadow-lg">
                <p class="text-[8px] text-cyan-400 font-black mb-1 uppercase tracking-widest">System</p>
                <p class="text-xs text-gray-400">Changement d'utilisateur : <b>${name}</b> en cours...</p>
            </div>`;
        }
        try { 
            const res = await fetch(`${N8N_URL}/webhook/chat-agent`, { 
                method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420'}, 
                body: JSON.stringify({ message: `[SYSTEM] Oublie l'utilisateur précédent. À partir de maintenant, je suis ${name}.`, email: userEmail, userName: name }) 
            }); 
            const responseData = await res.json();
            const r = Array.isArray(responseData) ? responseData[0] : responseData;
            if (r.output && chat) { chat.innerHTML += `<div class="msg-agent p-4 max-w-[90%] text-xs shadow-xl">${r.output}</div>`; }
            if (chat) chat.scrollTop = chat.scrollHeight;
        } catch(e) {}
    }

    function logout() { localStorage.clear(); location.reload(); }

    window.addEventListener('click', (e) => {
        if (!e.target.closest('.cursor-pointer')) {
            const dd = document.getElementById('user-dropdown');
            if(dd) dd.style.display = 'none';
        }
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = (SpeechRecognition) ? new SpeechRecognition() : null;
    if (recognition) {
        recognition.lang = 'fr-FR';
        recognition.onstart = () => { isListening = true; document.getElementById('micBtn').classList.add('mic-active'); };
        recognition.onresult = (e) => { document.getElementById('userInput').value = e.results[0][0].transcript; setTimeout(envoyerMessage, 400); };
        recognition.onend = () => { isListening = false; document.getElementById('micBtn').classList.remove('mic-active'); };
    }

    function toggleMic() { if (!recognition) return; (isListening) ? recognition.stop() : recognition.start(); }

    function moveToHeader(videoSrc) {
        const vBox = document.getElementById('video-box');
        const miniSlot = document.getElementById('mini-video-slot');
        const video = document.getElementById('agentVideo');
        if(vBox && miniSlot && !vBox.classList.contains('video-mini-active')) {
            vBox.classList.add('video-mini-active');
            vBox.classList.remove('flex-none', 'h-[30dvh]', 'border-b');
            miniSlot.appendChild(vBox);
        }
        if (video && videoSrc && !video.src.includes(videoSrc)) {
            video.src = videoSrc; video.load(); video.play().catch(e => {});
        }
    }

    function forceScrollTop() {
        const chat = document.getElementById('chat');
        if (chat) { setTimeout(() => { chat.scrollTo({ top: 0, behavior: 'instant' }); }, 100); }
    }

    function switchToCalendar(data) {
        moveToHeader("agent-avatar.mp4");
        showView('view-calendar');
        
        // Enregistrer temporairement les lignes du calendrier Notion pour cette semaine
        if (data) {
            const rows = Array.isArray(data) ? data : (data.data || data.items || []);
            if (rows.length > 0) {
                window.currentWeekNotionRows = rows;
            }
        }
        
        // Appeler notre moteur modulaire de calendrier premium
        if (typeof window.renderCalendarEngine === 'function') {
            window.renderCalendarEngine();
        } else {
            console.warn("renderCalendarEngine non encore chargé à l'initialisation.");
        }
    }

function switchToCooking(data) {
        moveToHeader("agent-cook.mp4"); 
        showView('view-cooking'); 
        const container = document.getElementById('view-cooking');
        if(!container) return;

        const btnPlus = document.getElementById('floating-plus');
        if(btnPlus) { btnPlus.classList.remove('hidden'); btnPlus.style.display = 'flex'; }
        
        const d = data.data || data;
        const allRecipes = Array.isArray(d) ? d : (d.recipes || []);
        recipesCache = allRecipes; 

        // On les garde dans le cache pour éviter les erreurs, mais on ne les affiche plus
        if(d.menuMidi) { recipesCache.push(d.menuMidi); }
        if(d.menuSoir) { recipesCache.push(d.menuSoir); }
        if(d.suggestionsTyler) { recipesCache = [...recipesCache, ...d.suggestionsTyler]; }

        // --- FILTRAGE DYNAMIQUE DES RECETTES ---
        const filteredRecipes = getFilteredItems(allRecipes, activeRecipeFilter);

        const sections = {
            "Entrées": [],
            "Plats": [],
            "Desserts": [],
            "Autres": []
        };

        const categoryIcons = {
            "Entrées": "leaf",
            "Plats": "utensils",
            "Desserts": "cookie",
            "Autres": "layout-grid"
        };
        
        filteredRecipes.forEach(r => {
            let catsRaw = r.property_cat_gorie || r.categorie || r.categories || "Autres";
            let cats = (typeof catsRaw === 'string') ? catsRaw.split(',').map(s => s.trim()) : (Array.isArray(catsRaw) ? catsRaw : [catsRaw]);

            let matchedAny = false;
            cats.forEach(c => {
                const normalizedCat = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const targetKey = Object.keys(sections).find(k => {
                    const normalizedKey = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return normalizedKey.includes(normalizedCat) || normalizedCat.includes(normalizedKey);
                });

                if(targetKey && targetKey !== "Autres") {
                    if(!sections[targetKey].some(item => item.id === r.id)) sections[targetKey].push(r);
                    matchedAny = true;
                }
            });

            if (!matchedAny) {
                if(!sections["Autres"].some(item => item.id === r.id)) sections["Autres"].push(r);
            }
        });

        // --- INJECTION DE L'ONGLET DE FILTRAGE GLASSMORPHIC ---
        let html = "";
        if (currentGroupMembers.length > 0 && currentGroupName) {
            html += `
            <div class="px-4 pt-2 pb-1">
                <div class="glass-segmented-control flex p-1 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl relative">
                    <button onclick="setRecipeFilter('coloc')" class="flex-1 py-2 text-[10px] font-black uppercase tracking-wider text-center rounded-xl transition-all duration-300 ${activeRecipeFilter === 'coloc' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-white/40 hover:text-white'}">
                        👥 ${currentGroupName}
                    </button>
                    <button onclick="setRecipeFilter('perso')" class="flex-1 py-2 text-[10px] font-black uppercase tracking-wider text-center rounded-xl transition-all duration-300 ${activeRecipeFilter === 'perso' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-white/40 hover:text-white'}">
                        👤 Perso
                    </button>
                </div>
            </div>`;
        }
        html += `<div class="p-2 space-y-10 animate-in fade-in duration-500">`;

        Object.keys(sections).forEach(title => {
            const list = sections[title];
            const icon = categoryIcons[title] || "chef-hat";
            if(list && list.length > 0) {
                html += `<section>
                    <div class="flex justify-between items-center mb-5 px-1">
                        <div class="category-badge">
                            <i data-lucide="${icon}" class="w-3.5 h-3.5 text-cyan-400"></i>
                            <h2 class="text-[10px] font-black text-white uppercase tracking-[0.15em]">${title}</h2>
                        </div>
                        <span class="text-[8px] font-bold text-white/30 uppercase tracking-widest">${list.length} recettes</span>
                    </div>
                    <div class="flex gap-4 overflow-x-auto no-scrollbar snap-x px-1">`;
                
                list.forEach(r => {
                    const recipeTitle = r.property_nom || r.nom || r.name || "";
                    let photoRaw = r.property_photo || r.photo;
                    let photoStr = "";
                    if (photoRaw) {
                        let item = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
                        if (typeof item === 'string') photoStr = item.trim();
                        else if (item && typeof item === 'object') photoStr = item.name || (item.file ? item.file.url : (item.external ? item.external.url : ""));
                    }

                    const clean = photoStr || (recipeTitle ? recipeTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".jpg" : "default-recipe.jpg");
                    const path = clean.startsWith('http') ? clean : `images/recettes/${clean}`;

                    html += `
                        <div class="recipe-card snap-start" onclick="openRecipe('${r.id}')">
                            <div class="relative aspect-[4/5] rounded-2xl overflow-hidden border border-white/10 mb-2.5 bg-white/5 shadow-2xl">
                                <img src="${path}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='images/recettes/default-recipe.jpg';">
                                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                                ${r.label ? `<div class="absolute top-2.5 left-2.5 bg-cyan-500 text-black font-black text-[7px] px-2 py-0.5 rounded-md uppercase shadow-lg shadow-cyan-500/20">${r.label}</div>` : ''}
                                <div class="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg text-[8px] text-white border border-white/10">
                                    <i data-lucide="clock" class="w-2.5 h-2.5 text-cyan-400"></i> ${r.temps || r.property_dur_e || 0} min
                                </div>
                            </div>
                            <p class="text-[10px] font-bold text-white/90 px-1 leading-tight line-clamp-2">${recipeTitle}</p>
                        </div>`;
                });
                html += `</div></section>`;
            }
        });

        html += `</div>`;
        container.innerHTML = html;
        lucide.createIcons();
        setTimeout(() => { container.scrollTo({ top: 0, behavior: 'instant' }); }, 100);
    }

    // Fonction de bascule de filtre
    window.setRecipeFilter = function(filter) {
        activeRecipeFilter = filter;
        switchToCooking({ data: recipesCache });
    };

    function openRecipe(id) {
        const isNew = (!id || id === 'null');
        const recipe = isNew ? {
            property_nom: "", name: "", property_ingredients: [], property_quantites: [], property_instructions: [], property_dur_es: [], property_parts: 1, property_cat_gorie: "Autres"
        } : (recipesCache.find(r => String(r.id) === String(id)) || {
            property_nom: "", name: "", property_ingredients: [], property_quantites: [], property_instructions: [], property_dur_es: [], property_parts: 1, property_cat_gorie: "Autres"
        });

        const modal = document.getElementById('recipe-modal');
        const body = document.getElementById('recipe-detail-body');
        if(!modal || !body) return;

        const categories = ["Entrées", "Plats", "Desserts", "Autres", "Suggestions de Tyler", "Menu de la semaine"];
        const recipeName = recipe.property_nom || recipe.name || "";
        const currentCats = recipe.property_cat_gorie || "";
        const partsValue = recipe.property_parts || 1;

        let photoStr = "";
        if (!isNew) {
            let photoRaw = recipe.property_photo || recipe.photo;
            if (photoRaw) {
                let item = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
                if (typeof item === 'string') photoStr = item.trim();
                else if (item && typeof item === 'object') photoStr = item.name || (item.file ? item.file.url : (item.external ? item.external.url : ""));
            }
        }

        const path = isNew ? "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" : (photoStr || (recipeName ? recipeName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".jpg" : "default-recipe.jpg"));
        const finalPath = path.startsWith('http') || path.startsWith('data:') ? path : `images/recettes/${path}`;
        
        const kcal = parseFloat(recipe.property_kcal_part || 0).toFixed(1);
        const prot = parseFloat(recipe.property_p_part || 0).toFixed(1);
        const glu = parseFloat(recipe.property_g_part || 0).toFixed(1);
        const lip = parseFloat(recipe.property_l_part || 0).toFixed(1);
        
        const parseNotionList = (val, separator) => {
            if (!val) return [];
            if (Array.isArray(val)) {
                if (val.length === 0) return [];
                if (val.length > 1) return val.filter(s => s !== undefined && s !== null);
                val = val[0];
            }
            if (val === undefined || val === null || String(val).trim() === "") return [];
            if (typeof val !== 'string') return [val];
            return val.split(separator).map(s => s.trim()).filter(s => s.length > 0);
        };
const getProp = (obj, keywords) => {
            const k = Object.keys(obj).find(key => keywords.some(kw => key.toLowerCase().includes(kw)));
            return k ? obj[k] : null;
        };

        const rawQuants = getProp(recipe, ['quantit_saisie', 'quantite_saisie', 'quantit_unit', 'quantite_unite']) || getProp(recipe, ['quantit']);
        const rawUnites = getProp(recipe, ['unite_utilisee', 'unit_utilis']);
        const rawPoids = getProp(recipe, ['poids_ref', 'poids_r_f']);
        const rawUnitesSpe = getProp(recipe, ['unite_spe', 'unit_sp_']);

        const quantsSaisies = parseNotionList(rawQuants, ',');
        const unitesList = parseNotionList(rawUnites, ',');
        const poidsList = parseNotionList(rawPoids, ',');
        const unitesSpeList = parseNotionList(rawUnitesSpe, ',');

        const names = parseNotionList(recipe.property_ingredients, ',');
        const compositionIds = recipe.property_composition_recette || [];
        const etapeIds = recipe.property_etapes_de_cuisine || [];
        const k_list = parseNotionList(recipe.property_kcal, ',');
        const p_list = parseNotionList(recipe.property_p, ',');
        const g_list = parseNotionList(recipe.property_g, ',');
        const l_list = parseNotionList(recipe.property_l, ',');

        const formattedIngredients = names.map((nom, index) => {
            const qOriginale = parseFloat(quantsSaisies[index]) || 1;
            const uniteUti = unitesList[index] || "Grammes";
            const pRef = parseFloat(poidsList[index]) || 0;
            const uSpe = unitesSpeList[index] || (uniteUti !== "Grammes" ? uniteUti : "");

            // Crucial : on calcule le poids total pour obtenir les macros "pour 1 gramme" (sinon le calcul crash si on charge des "unités")
            const totalGrammes = (uniteUti === "Grammes") ? qOriginale : (qOriginale * pRef);
            const diviseur = totalGrammes > 0 ? totalGrammes : 1;

            return { 
                nom: nom, 
                quantite: qOriginale,
                unite_utilisee: uniteUti,
                poids_ref: pRef,
                unite_spe: uSpe,
                compositionId: compositionIds[index] || null,
                ratios: {
                    kcal: (parseFloat(k_list[index]) || 0) / diviseur,
                    p: (parseFloat(p_list[index]) || 0) / diviseur,
                    g: (parseFloat(g_list[index]) || 0) / diviseur,
                    l: (parseFloat(l_list[index]) || 0) / diviseur
                }
            };
        });
        const instructions = parseNotionList(recipe.property_instructions, '|||');
        const durations = parseNotionList(recipe.property_dur_es, '|||');
        
        deletedIngredients = [];
        deletedEtapes = [];

        const formattedSteps = instructions.map((text, index) => {
            return { desc: text, duree: durations[index] || 0, etapeId: etapeIds[index] || null };
        });

        body.innerHTML = `
            <div class="relative w-full h-[45dvh] overflow-hidden group">
                <input type="file" id="recipe-photo-input" class="hidden" accept="image/*" onchange="handlePhotoUpload(this)">
                <img id="recipe-preview-img" src="${finalPath}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='images/recettes/default-recipe.jpg';">          
                <div class="absolute inset-0 bg-black/60 flex items-center justify-center gap-6 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <div onclick="document.getElementById('recipe-photo-input').click()" class="cursor-pointer bg-white/10 backdrop-blur-md p-4 rounded-full border border-white/20 hover:scale-110 transition-transform" title="Uploader une photo">
                        <i data-lucide="camera" class="w-6 h-6 text-white"></i>
                    </div>
                    <div onclick="generateRecipeImage()" class="cursor-pointer bg-purple-600/40 backdrop-blur-md p-4 rounded-full border border-purple-400/50 shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:scale-110 transition-transform" title="Générer avec l'IA">
                        <i data-lucide="sparkles" class="w-6 h-6 text-purple-300"></i>
                    </div>
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent pointer-events-none z-0"></div>
                <div class="absolute top-6 left-0 right-0 flex justify-center gap-1.5 z-20 px-4">
                     <div class="info-circle !relative !w-11 !h-11 border-white/20">
                        <span class="text-[6px] font-black text-white/40 uppercase">Min</span>
                        <span class="text-[10px] font-black text-white">${recipe.property_dur_e || 0}</span>
                    </div>
                    <div class="info-circle !relative !w-11 !h-11 border-[#f97316]/40">
                        <span class="text-[6px] font-black text-[#f97316] uppercase">Kcal</span>
                        <span id="display-kcal" class="text-[10px] font-black text-white">${kcal}</span>
                    </div>
                    <div class="info-circle !relative !w-11 !h-11 border-[#3b82f6]/40">
                        <span class="text-[6px] font-black text-[#3b82f6] uppercase">P</span>
                        <span id="display-prot" class="text-[10px] font-black text-white">${prot}</span>
                    </div>
                    <div class="info-circle !relative !w-11 !h-11 border-[#22c55e]/40">
                        <span class="text-[6px] font-black text-[#22c55e] uppercase">G</span>
                        <span id="display-glu" class="text-[10px] font-black text-white">${glu}</span>
                    </div>
                    <div class="info-circle !relative !w-11 !h-11 border-[#ef4444]/40">
                        <span class="text-[6px] font-black text-[#ef4444] uppercase">L</span>
                        <span id="display-lip" class="text-[10px] font-black text-white">${lip}</span>
                    </div>
                </div>
                <div class="absolute bottom-16 right-6 flex gap-3 z-30">
                    <button onclick="openMacroPopup()" class="w-11 h-11 bg-purple-600/90 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-purple-400/30 shadow-2xl active:scale-90 transition-transform">
                        <i data-lucide="pie-chart" class="w-5 h-5 text-white"></i>
                    </button>
                    <button id="btn-cart-recipe" onclick="sendRecipeToCart()" class="w-11 h-11 bg-amber-600/90 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-amber-400/30 shadow-2xl active:scale-90 transition-transform">
                        <i data-lucide="shopping-cart" class="w-5 h-5 text-white"></i>
                    </button>
                    <button id="btn-save-recipe" onclick="saveRecipeData('${recipe.id}')" class="w-11 h-11 bg-blue-600/90 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-blue-400/30 shadow-2xl active:scale-90 transition-transform">
                        <i data-lucide="save" class="w-5 h-5 text-white"></i>
                    </button>
                </div>
            </div>

            <div class="px-7 -mt-12 relative z-10">
                <input type="text" id="recipe-name-input" value="${recipeName}" placeholder="Nom de la recette" class="w-full bg-transparent text-3xl font-black text-white uppercase tracking-tighter mb-6 outline-none">
                <div class="space-y-6 mb-10">
                    <div class="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="text-[11px] font-black text-white/70 uppercase tracking-widest">Nombre de parts</span>
                            <select id="recipe-parts-select" onchange="recalculateMacros()" class="custom-select font-black text-cyan-400">
                                ${Array.from({length: 50}, (_, i) => i + 1).map(n => `<option value="${n}" ${n == partsValue ? 'selected' : ''}>${n}</option>`).join('')}
                            </select>
                        </div>
                        <!-- BUTTON DE GENERATION IA -->
                        <button onclick="openAiGenerationModal()" class="w-full bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-500/40 py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-inner shadow-purple-500/10">
                            <i data-lucide="sparkles" class="w-3.5 h-3.5 text-purple-400"></i>
                            <span class="text-[10px] font-black text-purple-300 uppercase tracking-wider">Génération de recettes</span>
                        </button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${categories.map(c => `<button class="category-chip ${currentCats.includes(c) ? 'active' : ''}" onclick="this.classList.toggle('active')">${c}</button>`).join('')}
                    </div>
                </div>

                <div class="mb-10">
                    <div class="flex justify-between items-center mb-5">
<h3 class="text-[11px] font-black text-cyan-400 uppercase tracking-widest">Ingrédients</h3>                        <button onclick="addIngredientRow()" class="text-cyan-400"><i data-lucide="plus-circle" class="w-5 h-5"></i></button>
                    </div>
                    <div id="ingredients-container" class="space-y-1">
${formattedIngredients.length > 0 ? formattedIngredients.map(ing => renderIngredientRow(ing.nom, ing.quantite, ing.ratios, ing.compositionId, null, ing.unite_spe, ing.poids_ref, ing.unite_utilisee)).join('') : '<p class="text-[10px] text-white/20 text-center py-4 italic">Aucun ingrédient répertorié</p>'}                    </div>
                </div>

           <div class="mb-12">
                    <div class="flex justify-between items-center mb-5">
                        <h3 class="text-[11px] font-black text-cyan-400 uppercase tracking-widest">Préparation</h3>
                        <button onclick="addStepRow()" class="text-cyan-400"><i data-lucide="plus-circle" class="w-5 h-5"></i></button>
                    </div>
                    <div id="steps-container" class="space-y-8">
                        ${formattedSteps.length > 0 ? formattedSteps.map((step, idx) => renderStepRow(idx + 1, step.desc, step.duree, step.etapeId)).join('') : '<p class="text-[10px] text-white/20 text-center py-4 italic">Aucune instruction saisie</p>'}
                    </div>
                </div>

                <button id="btn-tyler-eval" onclick="demanderEvaluationTyler()" class="w-full mt-8 mb-6 bg-purple-950/40 border border-purple-500/40 py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-purple-500/10">
                    <i data-lucide="sparkles" class="w-4 h-4 text-purple-400"></i>
                    <span class="text-[10px] font-black text-purple-400 uppercase tracking-widest">Évaluation et suggestion de Tyler</span>
                </button>

                <button class="w-full bg-cyan-500 py-5 rounded-2xl flex items-center justify-center gap-4 active:scale-95 transition-transform">
                    <i data-lucide="flame" class="w-6 h-6 text-black"></i>
                    <span class="text-base font-black text-black uppercase tracking-widest">Cuisiner !</span>
                </button>
                
                <button onclick="deleteRecipe('${recipe.id}')" 
                    class="w-full mt-3 mb-3 py-3 rounded-2xl flex items-center justify-center gap-3 border border-red-500/10 bg-red-900/10 active:scale-95 transition-transform text-red-500 hover:bg-red-900/20">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                    <span class="text-xs font-black uppercase tracking-widest">Supprimer cette recette</span>
                </button>
                
            </div>`;
        modal.style.display = 'flex';
        lucide.createIcons();
        autoResizeSteps();
    
    }

function renderIngredientRow(nom = "", qte = "", ratios = {kcal:0, p:0, g:0, l:0}, compositionId = null, alimentId = "", uniteSpe = "", poidsRef = 0, uniteUtilisee = "Grammes") {
        const initialAlimentId = alimentId || (compositionId ? "loaded" : "");
        const isLinked = !!initialAlimentId;
        return `
        <div class="relative ingredient-row group" data-rkcal="${ratios.kcal}" data-rp="${ratios.p}" data-rg="${ratios.g}" data-rl="${ratios.l}" data-composition-id="${compositionId || ''}" data-aliment-id="${initialAlimentId}" data-unite-spe="${uniteSpe}" data-poids-ref="${poidsRef}">
            <div class="ingredient-container flex flex-col bg-white/[0.03] p-2 rounded-xl border border-white/5 transition-colors">
                
                <!-- NOUVELLE LIGNE : BOUTONS D'ACTION EN HAUT -->
                <div class="flex justify-end gap-4 mb-2 pr-1">
                    <button onclick="sendRowToCart(this)" class="text-white/30 hover:text-amber-500 transition-colors" title="Ajouter aux courses">
                        <i data-lucide="shopping-cart" class="w-4 h-4"></i>
                    </button>
                    <button onclick="const row = this.closest('.ingredient-row'); const cid = row.dataset.compositionId; if(cid) deletedIngredients.push(cid); row.remove(); recalculateMacros();" class="text-white/30 hover:text-red-500 transition-colors" title="Supprimer">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>

                <!-- LIGNE DES CHAMPS DE SAISIE -->
                <div class="flex items-center gap-2">
                    <input type="number" value="${parseFloat(qte) || ''}" oninput="recalculateMacros()" placeholder="0" class="w-14 bg-cyan-500/10 border border-cyan-500/20 rounded-lg py-1.5 px-2 text-[10px] font-black text-cyan-400 outline-none text-center ingredient-qte">
                    
                    <select class="bg-white/5 border border-white/10 rounded-lg py-1.5 px-2 text-[10px] text-cyan-400 outline-none ingredient-unit" data-current-unit="${uniteUtilisee}" onchange="handleUnitChange(this)">
                        <option value="Grammes" ${uniteUtilisee === 'Grammes' ? 'selected' : ''}>g</option>
                        ${uniteSpe && uniteSpe !== 'Grammes' ? `<option value="${uniteSpe}" ${uniteUtilisee === uniteSpe ? 'selected' : ''}>${uniteSpe}</option>` : ''}
                    </select>
                    
                    <div class="flex-1 flex items-center relative ml-1">
                        <input type="text" value="${nom}" 
                            ${isLinked ? `readonly onclick="openIngredientSearchModal(this.closest('.ingredient-row'))"` : 'oninput="recalculateMacros()"'}
                            placeholder="${isLinked ? 'Sélectionner un aliment...' : 'Nom de l\'ingrédient...'}" 
                            class="w-full bg-transparent text-[13px] text-white/80 outline-none ingredient-name ${isLinked ? 'cursor-pointer' : ''}">
                        <button type="button" onclick="openIngredientSearchModal(this.closest('.ingredient-row'))" class="text-white/30 hover:text-cyan-400 p-1 flex-none transition-colors" title="Rechercher/Lier un ingrédient">
                            <i data-lucide="search" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
                
                <div class="error-msg text-[9px] text-red-400 mt-1 hidden font-bold pl-2">⚠️ Cet aliment n'est pas lié à la base Notion Aliments.</div>
            </div>
        </div>`;
    }
function handleUnitChange(select) {
        const row = select.closest('.ingredient-row');
        const qteInput = row.querySelector('.ingredient-qte');
        const poidsRef = parseFloat(row.dataset.poidsRef) || 0;
        
        const oldUnit = select.dataset.currentUnit || 'Grammes';
        const newUnit = select.value;
        
        if (poidsRef > 0 && oldUnit !== newUnit) {
            let currentVal = parseFloat(qteInput.value) || 0;
            if (oldUnit === 'Grammes') {
                // Bascule Grammes -> Unité Spécifique (ex: 120g -> 2 œufs)
                let newVal = currentVal / poidsRef;
                qteInput.value = parseFloat(newVal.toFixed(2)); // Évite les chiffres à rallonge
            } else if (newUnit === 'Grammes') {
                // Bascule Unité Spécifique -> Grammes (ex: 2 œufs -> 120g)
                let newVal = currentVal * poidsRef;
                qteInput.value = Math.round(newVal); // On arrondit les grammes à l'entier
            }
        }
        
        // On mémorise la nouvelle unité et on relance les macros
        select.dataset.currentUnit = newUnit;
        recalculateMacros();
    }
    function autoResizeSteps() {
    // Un léger délai pour s'assurer que le HTML est rendu (sinon scrollHeight vaut 0)
    setTimeout(() => {
        document.querySelectorAll('#steps-container textarea').forEach(ta => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
        });
    }, 50);
}
    function renderStepRow(num, desc = "", duree = "", etapeId = null) {
        return `
        <div class="flex gap-4 group" data-etape-id="${etapeId || ''}">
            <div class="flex-none w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center text-[11px] font-black text-cyan-400 border border-cyan-500/20">${num}</div>
            <div class="flex-1 space-y-2">
<textarea class="w-full bg-transparent text-[13px] text-white/60 leading-relaxed outline-none border-b border-white/5 focus:border-cyan-500/50 resize-none overflow-hidden" rows="1" placeholder="Description de l'étape" oninput="this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'">${desc}</textarea>                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-[10px] font-black text-cyan-400/80 uppercase">
                        <i data-lucide="timer" class="w-3.5 h-3.5"></i>
                        <input type="number" value="${parseInt(duree) || ''}" placeholder="0" oninput="recalculateDuration()" class="bg-transparent focus:outline-none w-8 text-center step-duration"> min
                    </div>
                    <button onclick="const grp = this.closest('.group'); const eid = grp.dataset.etapeId; if(eid) deletedEtapes.push(eid); grp.remove(); recalculateDuration();" class="text-white/30 hover:text-red-500 transition-colors">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }
async function deleteRecipe(id) {
    // 1. Double confirmation pour éviter les erreurs
    if (!confirm("⚠️ Es-tu sûr de vouloir supprimer cette recette ? Cette action est irréversible.")) {
        return;
    }

    // 2. Appel API vers n8n
    try {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Suppression...';

        const res = await fetch(`${N8N_URL}/webhook/delete-recipe`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ 
                recipeId: id, 
                email: userEmail 
            }) 
        });

        if (res.ok) {
            closeRecipe(); // Ferme la modale
            showNotification("Recette supprimée avec succès", "success");
            
            // 3. Rafraîchir la vue cuisine
            await triggerQuickAction('cuisine');
        } else {
            throw new Error("Erreur serveur");
        }
    } catch (e) {
        console.error(e);
        showNotification("Impossible de supprimer la recette.", "error");
    }
}
let activeEditingRow = null;
    function addIngredientRow() {
        console.log("DEBUG: addIngredientRow called!");
        searchModalMode = "recipe";
        openIngredientSearchModal(null);
    }

    /* --- GESTION GENERATION RECETTE VIA IA --- */
function openAiGenerationModal() {
    // On récupère les valeurs actuelles du template principal (s'il y en a)
    const currentTitle = document.getElementById('recipe-name-input').value;
    const currentParts = document.getElementById('recipe-parts-select').value;
    
    // On pré-remplit la modale
    document.getElementById('ai-recipe-title').value = currentTitle || "";
    document.getElementById('ai-recipe-portions').value = currentParts || 1;
    
    document.getElementById('ai-prompt-input').value = "";
    document.getElementById('ai-priority-slider').value = 50;
    updateAiSliderLabels(50);
    document.getElementById('ai-generation-modal').style.display = 'flex';
}

    function closeAiGenerationModal() {
        document.getElementById('ai-generation-modal').style.display = 'none';
    }

    function updateAiSliderLabels(value) {
        const fitValue = 100 - value;
        const goutValue = value;
        document.getElementById('ai-slider-values').innerText = `Fit: ${fitValue}% | Goût: ${goutValue}%`;
    }

  async function submitAiRecipeGeneration() {
    const promptText = document.getElementById('ai-prompt-input').value.trim();
    // 1. Récupération des nouveaux champs
    const recipeTitle = document.getElementById('ai-recipe-title').value.trim();
    const recipePortions = parseInt(document.getElementById('ai-recipe-portions').value) || 1;
    
    const sliderVal = parseInt(document.getElementById('ai-priority-slider').value);
    const fitPriority = 100 - sliderVal;
    const goutPriority = sliderVal;
    
    if (!promptText && !recipeTitle) {
        alert("Veuillez saisir un nom ou un prompt descriptif pour guider l'IA.");
        return;
    }

    const btn = document.getElementById('btn-confirm-ai-gen');
    const originalHtml = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Génération...';
        lucide.createIcons();

        const response = await fetch(`${N8N_URL}/webhook/generate-recipe-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: promptText,
                titre: recipeTitle,       // Nouveau paramètre pour n8n
                parts: recipePortions,    // Nouveau paramètre pour n8n
                priorite_fit: fitPriority,
                priorite_gout: goutPriority,
                email: userEmail,
                userName: localStorage.getItem('fitbuddy_user_name') || "Utilisateur"
            })
        });

        if (!response.ok) throw new Error("Erreur serveur lors de la génération");

        const resData = await response.json();
        const data = Array.isArray(resData) ? resData[0] : resData;

        if (data && data.recette) {
            // 2. Remplissage automatique du titre (on privilégie celui de l'IA s'il a été reformulé, sinon celui saisi, sinon un titre par défaut)
            document.getElementById('recipe-name-input').value = data.recette.nom || recipeTitle || "Recette Générée";
            
            // 3. Remplissage automatique des parts
            const partsSelect = document.getElementById('recipe-parts-select');
            if (partsSelect) {
                partsSelect.value = data.recette.parts || recipePortions;
            }
            
            // Injection des ingrédients générés (avec le correctif précédent pour les calculs)
            const ingContainer = document.getElementById('ingredients-container');
            if (data.recette.ingredients && data.recette.ingredients.length > 0) {
                ingContainer.innerHTML = data.recette.ingredients.map(ing => {
                    const ratios = ing.ratios || { kcal: 0, p: 0, g: 0, l: 0 };
                    let qteAffichee = parseFloat(ing.quantite) || 0;
                    const pRef = parseFloat(ing.poids_ref) || 0;
                    const unite = ing.unite_utilisee || "Grammes";

                    if (unite !== "Grammes" && pRef > 0) {
                        qteAffichee = parseFloat((qteAffichee / pRef).toFixed(2));
                    }

                    return renderIngredientRow(
                        ing.nom, 
                        qteAffichee, 
                        ratios, 
                        null, 
                        ing.alimentId || "",
                        ing.unite_spe || "",          
                        pRef,           
                        unite 
                    );
                }).join('');
            }

         // Injection des étapes de préparation
            const stepContainer = document.getElementById('steps-container');
            if (data.recette.etapes && data.recette.etapes.length > 0) {
                stepContainer.innerHTML = data.recette.etapes.map((step, idx) => {
                    return renderStepRow(idx + 1, step.description, step.duree || 0, null);
                }).join('');
            }

            lucide.createIcons();
            recalculateMacros();
            recalculateDuration();
            autoResizeSteps(); // <--- AJOUTER ICI
            closeAiGenerationModal();
            showNotification("Recette générée avec succès ! ✨", "success");
        } else {
            alert("L'agent n'a pas retourné une structure de recette valide.");
        }

    } catch (error) {
        console.error(error);
        alert("Une erreur est survenue lors de la communication avec l'agent FitBuddy.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        lucide.createIcons();
    }
}

    function addStepRow() {
        const container = document.getElementById('steps-container');
        if (!container) return;
        if (!container.querySelector('.group')) container.innerHTML = '';
        const nextNum = container.children.length + 1;
        container.insertAdjacentHTML('beforeend', renderStepRow(nextNum));
        lucide.createIcons();
        recalculateDuration();
    }

    function closeRecipe() { document.getElementById('recipe-modal').style.display = 'none'; }
    function addNewRecipe() { openRecipe(null); }

    /* --- MACROS --- */
    function switchToMacros(data) {
        moveToHeader("agent-eat.mp4");
        showView('view-macros'); 
        const container = document.getElementById('view-macros'); 
        if(!container) return;
        document.getElementById('floating-plus').classList.add('hidden');

        let cachedProfile = {};
        try {
            cachedProfile = JSON.parse(localStorage.getItem('fitbuddy_user_profile')) || {};
        } catch(e) {}
        const hasNoGoals = !cachedProfile.objectif_calorique || cachedProfile.objectif_calorique === 0;

        const d = (data.data) ? data.data : data;
        let listeAliments = [];

        if (d.aliments) {
            if (Array.isArray(d.aliments)) { listeAliments = d.aliments; } 
            else if (typeof d.aliments === 'object') { listeAliments = Object.values(d.aliments); }
        }
        listeAliments.reverse();
        const water = d.water || { current: 0, goal: 5000, unit: 'ML', remaining: 5000 };
        const calories = d.calories || { current: 0, goal: 2000, unit: 'KCAL', remaining: 2000 };
        const proteins = d.proteins || { current: 0, goal: 150, unit: 'G', remaining: 150 };
        const carbs = d.carbs || { current: 0, goal: 200, unit: 'G', remaining: 200 };
        const lipids = d.lipids || { current: 0, goal: 70, unit: 'G', remaining: 70 };
        const pWater = Math.min((water.current / water.goal) * 100, 100);
        const rings = [
            { label: 'CALORIES', val: calories, color: '#f97316' },
            { label: 'PROTÉINES', val: proteins, color: '#3b82f6' },
            { label: 'GLUCIDES', val: carbs, color: '#22c55e' },
            { label: 'LIPIDES', val: lipids, color: '#ef4444' }
        ];
        let html = `<div class="p-2 space-y-6 animate-in fade-in duration-500">
            <div class="bg-white/5 p-4 rounded-2xl border border-white/10">
                <div class="flex justify-between items-end mb-2">
                    <div class="flex items-center gap-2 text-cyan-400 font-bold text-[10px] tracking-widest"><i data-lucide="droplets" class="w-3 h-3"></i> NIVEAU D'HYDRATATION</div>
                    <span class="text-[8px] text-white/40 uppercase font-bold">RESTANT : ${water.remaining}${water.unit}</span>
                </div>
                <div class="water-progress mb-2"><div class="water-bar" style="width: ${pWater}%"></div></div>
                <div class="flex justify-between items-baseline">
                    <div class="text-2xl font-black text-white font-mono">${water.current}<span class="text-[10px] ml-1 font-normal text-cyan-400">${water.unit}</span></div>
                    <div class="text-[8px] text-white/30 uppercase font-bold">OBJECTIF : ${water.goal}${water.unit}</div>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                ${rings.map(m => {
                    const pct = Math.min((m.val.current / m.val.goal) * 100, 100);
                    return `<div class="flex flex-col items-center gap-3 p-3 bg-white/[0.03] rounded-2xl border border-white/5">
                        <span class="text-[9px] font-black text-cyan-400 tracking-widest uppercase">${m.label}</span>
                        <div class="macro-ring">
                            <div class="absolute inset-0 rounded-full" style="background: conic-gradient(${m.color} ${pct * 3.6}deg, rgba(255,255,255,0.05) 0deg); -webkit-mask: radial-gradient(transparent 58%, black 59%); mask: radial-gradient(transparent 58%, black 59%);"></div>
                            <span class="macro-value" style="color: ${m.color}">${Math.round(pct)}%</span>
                        </div>
                        <div class="text-center">
                            <div class="text-[8px] text-white/40 uppercase tracking-tighter mb-1">CONSO : ${m.val.current}/${m.val.goal}${m.val.unit}</div>
                            <div class="text-[9px] font-bold text-cyan-400 uppercase tracking-tight">RESTANT : ${m.val.remaining}${m.val.unit}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            ${listeAliments.length > 0 ? `<div class="bg-white/5 p-4 rounded-2xl border border-white/10 mt-2 shadow-lg">
                <span class="text-[9px] font-black text-cyan-400 tracking-widest uppercase mb-3 block text-center">Journal Alimentaire</span>
                <div id="journal-container" class="flex flex-wrap justify-center gap-2">
                    ${listeAliments.map((a, idx) => {
                        const name = (typeof a === 'object' && a !== null) ? (a.nom || "Aliment") : a;
                        const id = (typeof a === 'object' && a !== null) ? (a.id || a.pageId || a.idNotion) : `idx-${idx}`;
                        const cal = a.calories || 0; const prot = a.prot || a.proteines || 0; const glu = a.glu || a.glucides || 0; const lip = a.lip || a.lipides || 0;
                        return `<span id="food-${id}" onclick="toggleAliment('${id}', '${name.replace(/'/g, "\\'")}', ${cal}, ${prot}, ${glu}, ${lip})" class="px-3 py-1 bg-white/10 border border-white/20 rounded-full text-[10px] text-gray-200 font-medium cursor-pointer transition-all active:scale-90">${String(name).trim()}</span>`;
                    }).join('')}
                </div>
            </div>` : ''}
            <button onclick="openRecipePicker()" class="w-full flex items-center justify-center gap-3 p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 active:scale-95 transition-transform mt-2">
                <i data-lucide="utensils" class="w-4 h-4 text-cyan-400"></i>
                <span class="text-[11px] font-black text-cyan-400 uppercase tracking-widest">Ajouter un repas aux macros</span>
            </button>
            <button onclick="openMacroFoodPicker()" class="w-full flex items-center justify-center gap-3 p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 active:scale-95 transition-transform mt-2">
                <i data-lucide="apple" class="w-4 h-4 text-cyan-400"></i>
                <span class="text-[11px] font-black text-cyan-400 uppercase tracking-widest">Ajouter un aliment aux macros</span>
            </button>

            <!-- BOUTON D'OBJECTIFS MACROS DYNAMIQUE -->
            ${hasNoGoals ? `
            <button onclick="openMacroGoalsModal()" class="w-full mt-4 py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-center text-[10px] font-black text-white uppercase tracking-widest transition-all shadow-lg shadow-purple-500/20 active:scale-[0.98] border border-white/10 animate-pulse flex items-center justify-center gap-2">
                <i data-lucide="sliders" class="w-4 h-4 text-white"></i> Créer les objectifs macros
            </button>
            ` : `
            <button onclick="openMacroGoalsModal()" class="w-full mt-4 py-2 text-center text-[9px] font-bold text-white/20 hover:text-white/50 uppercase tracking-widest transition-colors">
                <i data-lucide="sliders" class="w-3 h-3 inline-block mr-1 align-text-bottom"></i> Modifier les objectifs macros
            </button>
            `}

        </div>`;
      container.innerHTML = html;
    lucide.createIcons();

    // Pré-remplissage de la modale macros
    const m = d.mensurations;
    if (m) {
        if (m.age)         document.getElementById('mg-age').value    = m.age;
        if (m.taille)      document.getElementById('mg-taille').value  = m.taille;
        if (m.poids)       document.getElementById('mg-poids').value   = m.poids;
        if (m.masse_grasse) document.getElementById('mg-bf').value     = m.masse_grasse;
    }

    setTimeout(() => { container.scrollTo({ top: 0, behavior: 'instant' }); }, 100);

    }

    async function toggleAliment(id, name, cal, prot, glu, lip) {
        const el = document.getElementById(`food-${id}`);
        if (!el) return;
        const isDeleting = !el.classList.contains('food-deleted');
        const journalContainer = document.getElementById('journal-container');
        if (isDeleting && journalContainer) { el.classList.add('food-deleted'); journalContainer.appendChild(el); } 
        else if (journalContainer) { el.classList.remove('food-deleted'); journalContainer.prepend(el); }
        try { fetch(`${N8N_URL}/webhook/food-action`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: isDeleting ? "delete" : "restore", alimentId: id, nom: name, calories: cal, proteines: prot, glucides: glu, lipides: lip, email: userEmail, userName: userEmail }) }); } catch(e){}
    }

   function switchToShopping(data) {
    moveToHeader("agent-courses.mp4");
    showView('view-shopping');
    const container = document.getElementById('view-shopping');
    if(!container) return;
    document.getElementById('floating-plus').classList.add('hidden');

    let rawItems = (Array.isArray(data)) ? data : (data.items || data.data || []);
    
    // Garder une référence des éléments bruts pour le changement de filtre instantané
    if (!window.shoppingCacheRaw || Array.isArray(data)) {
        window.shoppingCacheRaw = rawItems;
    }

    // --- FILTRAGE DYNAMIQUE DE LA LISTE DE COURSES ---
    const filteredRaw = getFilteredItems(window.shoppingCacheRaw, activeShoppingFilter);

    currentList = filteredRaw
        .filter(i => {
            const s = (i.property_statut || i.statut || i.status || "in_basket").toLowerCase().trim();
            return s === "in_basket";
        })
        .map((i, idx) => {
            let photoRaw = i.property_photo || i.photo;
            let photoStr = "";
            if (photoRaw) {
                let item = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
                if (typeof item === 'string') photoStr = item.trim();
                else if (item && typeof item === 'object') {
                    photoStr = item.name || (item.file ? item.file.url : (item.external ? item.external.url : ""));
                }
            }

            return {
                id: i.id || i.pageId || i.idNotion || `idx-${idx}`,
                nom: (i.property_nom || i.nom || i.item || i.name || "Produit").trim(),
                quantite: i.property_quantite || i.quantite || "1",
                unite: i.property_unite || i.unite || "",
                rayon: (i.property_rayon || i.rayon || i.category || "Autres").trim(),
                photo: photoStr,
                utilisateur: i.property_utilisateur || i.utilisateur || i.email || "",
                isPurchased: false
            };
        });       

    renderShopping(); 
    setTimeout(() => { container.scrollTo({ top: 0, behavior: 'instant' }); }, 100);
}

    function renderShopping() {
        const container = document.getElementById('view-shopping'); 
        if(!container) return;
        
        let html = "";
        if (currentGroupMembers.length > 0 && currentGroupName) {
            html += `
            <div class="px-4 pt-2 pb-1 flex-none font-bold">
                <div class="glass-segmented-control flex p-1 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl relative">
                    <button onclick="setShoppingFilter('coloc')" class="flex-1 py-2 text-[10px] font-black uppercase tracking-wider text-center rounded-xl transition-all duration-300 ${activeShoppingFilter === 'coloc' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-white/40 hover:text-white'}">
                        👥 ${currentGroupName}
                    </button>
                    <button onclick="setShoppingFilter('perso')" class="flex-1 py-2 text-[10px] font-black uppercase tracking-wider text-center rounded-xl transition-all duration-300 ${activeShoppingFilter === 'perso' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-white/40 hover:text-white'}">
                        👤 Perso
                    </button>
                </div>
            </div>`;
        }
        
        html += `<div id="shopping-content" class="space-y-6 p-4 flex-1 overflow-y-auto"></div>`;
        container.innerHTML = html;

        const content = document.getElementById('shopping-content');
        if(!content) return;
        RAYONS.forEach(r => {
            const items = currentList.filter(i => i.rayon.toLowerCase() === r.toLowerCase() && !i.isPurchased);
            if (items.length > 0) appendCategory(content, r, items);
        });
        const itemsInconnus = currentList.filter(i => !i.isPurchased && !RAYONS.some(r => r.toLowerCase() === i.rayon.toLowerCase()));
        if(itemsInconnus.length > 0) appendCategory(content, "AUTRES", itemsInconnus);
        const purchased = currentList.filter(i => i.isPurchased);
        if (purchased.length > 0) appendCategory(content, "PANIER", purchased, true);
    }

    // Fonction de bascule de filtre courses
    window.setShoppingFilter = function(filter) {
        activeShoppingFilter = filter;
        switchToShopping(window.shoppingCacheRaw);
    };

function appendCategory(container, title, items, isPurchased = false) {
    const section = document.createElement('div');
    section.innerHTML = `<h2 class="text-[9px] font-black text-cyan-400/40 uppercase mb-3 pl-1 border-l-2 border-cyan-400/20">${title}</h2><div class="grid grid-cols-3 gap-2"></div>`;
    const grid = section.querySelector('.grid');
    if(!grid) return;
    
    // 1. AJOUTE ICI TON URL RAW GITHUB (N'oublie pas de remplacer par tes infos)
    const githubBaseUrl = "https://raw.githubusercontent.com/samisteyre/fitbuddy/main/";

    items.forEach(item => {
        const card = document.createElement('div');
        card.onclick = () => togglePurchase(item.id);
        card.className = `relative aspect-[4/5] rounded-xl overflow-hidden bg-black border border-white/10 ${isPurchased ? 'purchased' : ''}`;
        
        const clean = item.nom.toLowerCase().replace(/\u0153/g, 'oe').replace(/\u0152/g, 'oe').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        
        // 2. MODIFICATION ICI : On utilise githubBaseUrl pour les images distantes
        let imgPath = item.photo 
            ? (item.photo.startsWith('http') || item.photo.startsWith('data:') ? item.photo : `${githubBaseUrl}images/produits/${item.photo}`) 
            : `${githubBaseUrl}images/produits/${clean}.jpg`;

        card.innerHTML = `<img src="${imgPath}" class="absolute inset-0 w-full h-full object-cover" onerror="this.src='default-item.svg';"><div class="absolute inset-0 bg-gradient-to-t from-black via-transparent p-2 flex flex-col justify-end"><p class="text-[9px] font-bold text-white leading-tight">${item.nom}</p><p class="text-[8px] text-cyan-400">${item.quantite} ${item.unite}</p></div>`;
        grid.appendChild(card);
    });
    container.appendChild(section);
}

 async function togglePurchase(id) {
    const item = currentList.find(i => i.id === id);
    if (!item) return;
    
    item.isPurchased = !item.isPurchased;
    renderShopping();
    
    try { 
        await fetch(`${N8N_URL}/webhook/shopping-action`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ 
                // Envoie "out_basket" si coché, sinon renvoie "add" pour le remettre au panier
                action: item.isPurchased ? "out_basket" : "add", 
                pageId: item.id, 
                produit: item.nom, 
                email: userEmail 
            })
        }); 
    } catch(e) {
        console.error("Erreur lors de la mise à jour du statut :", e);
    }
}

    function handlePhotoUpload(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.getElementById('recipe-preview-img');
                if(!img) return;
                img.src = e.target.result;
                img.dataset.base64 = e.target.result.split(',')[1];
                img.dataset.extension = input.files[0].name.split('.').pop();
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    function openMacroPopup() {
        const currentUser = localStorage.getItem('fitbuddy_user_name') || "";
        const select = document.getElementById('macro-user-select');
        if (select && currentUser) select.value = currentUser;
        document.getElementById('macro-log-modal').style.display = 'flex';
    }

    function closeMacroPopup() {
        document.getElementById('macro-log-modal').style.display = 'none';
    }

    async function confirmMacroSend() {
        const btnConfirm = event.target;
        const originalText = btnConfirm.innerText;
        
        const portions = parseFloat(document.getElementById('macro-portions').value) || 1;
        const targetUser = document.getElementById('macro-user-select').value;
        const mealName = document.getElementById('recipe-name-input').value || "Repas inconnu";
        
        // Map user profile name to email address for Notion title mapping
        let targetUserEmail = userEmail;
        if (targetUser === "Djibril") {
            targetUserEmail = "djibril@steyre.fr"; // Map placeholder, user can edit in index.html
        } else if (targetUser === "Maxime") {
            targetUserEmail = "maxime@steyre.fr"; // Map placeholder, user can edit in index.html
        } else if (targetUser === "Sami") {
            targetUserEmail = userEmail;
        } else if (targetUser.includes("@")) {
            targetUserEmail = targetUser; // Directly uses email if set in select options
        }
        
        const getVal = (id) => parseFloat(document.getElementById(id).innerText.replace(',', '.')) || 0;
        const macros = { kcal: getVal('display-kcal'), prot: getVal('display-prot'), glu: getVal('display-glu'), lip: getVal('display-lip') };

        const dataToSend = {
            email: userEmail, userName: targetUserEmail, repas: mealName, parts_consommees: portions,
            total_kcal: (macros.kcal * portions).toFixed(1), total_prot: (macros.prot * portions).toFixed(1),
            total_glu: (macros.glu * portions).toFixed(1), total_lip: (macros.lip * portions).toFixed(1),
            timestamp: new Date().toISOString()
        };

        btnConfirm.innerText = "ENVOI...";
        btnConfirm.disabled = true;

        fetch(`${N8N_URL}/webhook/log-macro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
            body: JSON.stringify(dataToSend)
        }).catch(() => {});

        closeMacroPopup();
        const chat = document.getElementById('view-chat') || document.getElementById('chat');
        if (chat) {
            chat.innerHTML += `
                <div class="msg-agent p-4 max-w-[90%] text-xs shadow-xl animate-in fade-in">
                    ✅ <b>${portions} portion(s)</b> de "${mealName}" enregistrée(s) pour <b>${targetUser}</b> !
                </div>`;
            chat.scrollTop = chat.scrollHeight;
        }

        btnConfirm.innerText = originalText;
        btnConfirm.disabled = false;
    }

  async function saveRecipeData(id) {
        const btnSave = document.querySelector('button[onclick*="saveRecipeData"]');
        let firstInvalidRowName = null;
        
        document.querySelectorAll('.ingredient-row').forEach(row => {
            const nameInput = row.querySelector('.ingredient-name');
            const nameValue = nameInput ? nameInput.value.trim() : "";
            const container = row.querySelector('.ingredient-container');
            const errorMsg = row.querySelector('.error-msg');

            if (container) container.classList.remove('border-red-500/50', 'bg-red-500/5');
            if (errorMsg) errorMsg.classList.add('hidden');

            const hasRatios = row.dataset.rkcal !== "" && row.dataset.rkcal !== undefined;
            if (nameValue.length > 0 && !hasRatios) {
                if (!firstInvalidRowName) firstInvalidRowName = nameValue;
                if (container) container.classList.add('border-red-500/50', 'bg-red-500/5');
                if (errorMsg) errorMsg.classList.remove('hidden');
            }
        });

        if (firstInvalidRowName) {
            alert(`⚠️ Enregistrement refusé :\nL'ingrédient "${firstInvalidRowName}" n'est pas lié à la base Notion Aliments.\n\nVeuillez cliquer sur cet ingrédient dans la liste des suggestions pour lui attribuer ses macros.`);
            return; 
        }
        
        const categories = [...document.querySelectorAll('.category-chip.active')].map(c => c.textContent.trim());
        const imgEl = document.getElementById('recipe-preview-img');
        let photoUploadPayload = null;
        let photoFilename = "";

        const recipeName = document.getElementById('recipe-name-input').value || "recette";
        const cleanName = recipeName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        // ─── GESTION INTELLIGENTE ET ROBUSTE DE L'IMAGE ───────────────────
        if (imgEl && imgEl.dataset.base64) {
            // Cas 1 : Image uploadée manuellement en base64
            const ext = imgEl.dataset.extension || 'jpg';
            photoFilename = `${cleanName}-${Date.now()}.${ext}`;
            photoUploadPayload = { base64: imgEl.dataset.base64, filename: photoFilename };
        } else if (imgEl && imgEl.dataset.remoteUrl && !imgEl.dataset.remoteUrl.includes('githubusercontent.com') && !imgEl.dataset.remoteUrl.includes('github.io')) {
            // Cas 2 : URL externe temporaire (ex: FAL.ai en direct) qui nécessite un téléchargement
            const ext = imgEl.dataset.extension || 'jpg';
            photoFilename = `${cleanName}-${Date.now()}.${ext}`;
            photoUploadPayload = { remoteUrl: imgEl.dataset.remoteUrl, filename: photoFilename };
        } else if (imgEl && imgEl.src) {
            // Cas 3 : L'image est déjà stockée dans l'écosystème (locale ou déjà sur GitHub via l'IA)
            const srcStr = imgEl.src;
            if (srcStr.includes('default-recipe.jpg') || srcStr.startsWith('data:image/gif')) {
                photoFilename = "";
            } else if (srcStr.includes('githubusercontent.com') || srcStr.includes('github.io') || srcStr.includes('images/recettes/')) {
                // Si l'image est sur GitHub ou en dossier local, on extrait juste le nom final (ex: crêpes-protéines-171656.jpg)
                photoFilename = srcStr.split('/').pop().split('?')[0];
            } else if (srcStr.startsWith('http://') || srcStr.startsWith('https://')) {
                // Si c'est une autre URL absolue officielle (Notion AWS, S3...), on conserve l'URL entière
                photoFilename = srcStr;
            } else {
                photoFilename = srcStr.split('/').pop();
            }
        }
        // ───────────────────────────────────────────────────────────────────

        const ingredients = [];
        document.querySelectorAll('.ingredient-row').forEach(row => {
            const nomValue = row.querySelector('.ingredient-name').value.trim();
            const qteInput = row.querySelector('.ingredient-qte');
            const unitSelect = row.querySelector('.ingredient-unit');
            
            if (nomValue) {
                ingredients.push({
                    id: row.dataset.compositionId || null,
                    alimentId: row.dataset.alimentId !== 'loaded' ? (row.dataset.alimentId || null) : null,
                    nom: nomValue,
                    quantite_saisie: parseFloat(qteInput.value) || 0,
                    unite_utilisee: unitSelect ? unitSelect.value : "Grammes"
                });
            }
        });

        const etapes = [];
        document.querySelectorAll('#steps-container .group').forEach((row) => {
            const descValue = row.querySelector('textarea').value.trim();
            if (descValue) {
                etapes.push({
                    id: row.dataset.etapeId || null,
                    description: descValue,
                    duree: parseFloat(row.querySelector('.step-duration').value) || 0,
                    ordre: etapes.length + 1
                });
            }
        });

        const payload = {
            email: userEmail,
            recette: {
                id: id, nom: document.getElementById('recipe-name-input').value,
                parts: parseInt(document.getElementById('recipe-parts-select').value),
                categories: categories, duree: etapes.reduce((sum, e) => sum + e.duree, 0), photo: photoFilename
            },
            ingredients: ingredients, etapes: etapes, ingredients_supprimes: deletedIngredients, etapes_supprimees: deletedEtapes, photo_upload: photoUploadPayload
        };

        try {
            if(btnSave) { btnSave.disabled = true; btnSave.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin text-white"></i>'; lucide.createIcons(); }
            const res = await fetch(`${N8N_URL}/webhook/save-recipe`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });

            if (res.ok) {
                deletedIngredients = []; deletedEtapes = [];
                closeRecipe();
                await triggerQuickAction('cuisine');
                const chat = document.getElementById('view-chat') || document.getElementById('chat');
                if (chat) {
                    chat.innerHTML += `<div class="msg-agent p-4 max-w-[90%] text-xs shadow-xl animate-in fade-in">✅ Recette "<b>${payload.recette.nom}</b>" sauvegardée dans Notion !</div>`;
                    chat.scrollTop = chat.scrollHeight;
                }
            } else { alert("Erreur lors de la sauvegarde."); }
        } catch(e) { alert("Impossible de contacter FitBuddy."); }
        finally {
            if(btnSave) { btnSave.disabled = false; btnSave.innerHTML = '<i data-lucide="save" class="w-5 h-5 text-white"></i>'; lucide.createIcons(); }
        }
    }

    async function demanderEvaluationTyler() {
        const btn = document.getElementById('btn-tyler-eval');
        if(!btn) return;
        const originalContent = btn.innerHTML;
        
        const recipeName = document.getElementById('recipe-name-input').value || "Recette sans nom";
        const parts = document.getElementById('recipe-parts-select').value;
        const categories = [...document.querySelectorAll('.category-chip.active')].map(c => c.textContent.trim()).join(', ');
        
        const ingredients = [];
        document.querySelectorAll('.ingredient-row').forEach(row => {
            const nom = row.querySelector('.ingredient-name').value.trim();
            const qte = row.querySelector('.ingredient-qte').value;
            if (nom) ingredients.push(`- ${qte ? qte + 'g de ' : ''}${nom}`);
        });

        const etapes = [];
        document.querySelectorAll('#steps-container .group').forEach((row, idx) => {
            const desc = row.querySelector('textarea').value.trim();
            const duree = row.querySelector('.step-duration').value;
            if (desc) etapes.push(`${idx + 1}. ${desc} (${duree || 0} min)`);
        });

        const messageTyler = `[SYSTEM_ACTION] Évalue la recette suivante et fais tes suggestions :\nNOM : ${recipeName}\nPARTS : ${parts}\nCATÉGORIES : ${categories}\nINGRÉDIENTS :\n${ingredients.join('\n')}\n\nPRÉPARATION :\n${etapes.join('\n')}`;

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin text-purple-400"></i> <span class="text-xs font-black text-purple-400 uppercase tracking-widest">Analyse de Tyler...</span>';
        if (window.lucide) lucide.createIcons();

        closeRecipe();
        showView('view-chat');

        const chat = document.getElementById('view-chat');
        if (chat) {
            chat.innerHTML += `<div class="msg-user p-4 max-w-[80%] text-xs shadow-lg animate-in slide-in-from-right-4 font-semibold">✨ Demande d'évaluation nutritionnelle pour "${recipeName}"</div>`;
            chat.innerHTML += `
                <div id="tyler-typing-indicator" class="msg-agent p-4 max-w-[90%] text-xs shadow-xl flex items-center gap-2 border border-purple-500/20 bg-purple-500/5 animate-pulse">
                    <div class="flex gap-1 items-center mr-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style="animation-delay: 0ms"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style="animation-delay: 150ms"></span>
                        <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style="animation-delay: 300ms"></span>
                    </div>
                    <span class="text-purple-300 font-medium italic">Tyler réfléchit...</span>
                </div>
            `;
            chat.scrollTop = chat.scrollHeight;
        }

        try {
            const res = await fetch(`${N8N_URL}/webhook/chat-agent`, { 
                method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420'}, body: JSON.stringify({ message: messageTyler, email: userEmail, userName: localStorage.getItem('fitbuddy_user_name') }) 
            });
            const responseData = await res.json();
            const r = Array.isArray(responseData) ? responseData[0] : responseData;
            
            const indicator = document.getElementById('tyler-typing-indicator');
            if (indicator) indicator.remove();
            
            if (r.output && chat) { chat.innerHTML += `<div class="msg-agent p-4 max-w-[90%] text-xs shadow-xl">${r.output}</div>`; }
            if (r.audio_base64 && r.audio_base64 !== "empty") { new Audio("data:audio/mp3;base64," + r.audio_base64).play(); }
            if (chat) chat.scrollTop = chat.scrollHeight;
        } catch(e) {
            const indicator = document.getElementById('tyler-typing-indicator');
            if (indicator) indicator.remove();
            if (chat) chat.innerHTML += `<div class="text-red-400 text-xs italic p-2">⚠️ Échec de la communication avec Tyler.</div>`;
        } finally {
            btn.disabled = false; btn.innerHTML = originalContent;
            if (window.lucide) lucide.createIcons();
        }
    }

    async function envoyerMessage() {
        const input = document.getElementById('userInput');
        if(!input) return;
        const msg = input.value.trim();
        if (!msg || !userEmail) return;

        showView('view-chat'); 
        const chat = document.getElementById('view-chat');
        if(!chat) return;
        chat.innerHTML += `<div class="msg-user p-4 max-w-[80%] text-xs shadow-lg animate-in slide-in-from-right-4 font-semibold">${msg}</div>`;
        chat.innerHTML += `
            <div id="tyler-typing-indicator" class="msg-agent p-4 max-w-[90%] text-xs shadow-xl flex items-center gap-2 border border-purple-500/20 bg-purple-500/5 animate-pulse">
                <div class="flex gap-1 items-center mr-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style="animation-delay: 0ms"></span>
                    <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style="animation-delay: 150ms"></span>
                    <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style="animation-delay: 300ms"></span>
                </div>
                <span class="text-purple-300 font-medium italic">Tyler réfléchit...</span>
            </div>
        `;
        input.value = ''; chat.scrollTop = chat.scrollHeight;

        try {
            const res = await fetch(`${N8N_URL}/webhook/chat-agent`, { method: 'POST', headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420'}, body: JSON.stringify({ message: msg, email: userEmail, userName: localStorage.getItem('fitbuddy_user_name') }) });
            const responseData = await res.json();
            const r = Array.isArray(responseData) ? responseData[0] : responseData;
            
            const indicator = document.getElementById('tyler-typing-indicator');
            if (indicator) indicator.remove();
            
            if (r.output) { chat.innerHTML += `<div class="msg-agent p-4 max-w-[90%] text-xs shadow-xl">${r.output}</div>`; }
            if (r.audio_base64 && r.audio_base64 !== "empty") { new Audio("data:audio/mp3;base64," + r.audio_base64).play(); }
            
            let actionStr = (r.action || (r.data && r.data.action) || "").toLowerCase();
            if (actionStr.includes("cuisine") || actionStr.includes("cook") || actionStr.includes("recette")) switchToCooking(r);
            else if (actionStr.includes("macro") || actionStr.includes("dashboard") || actionStr.includes("switchtomacros")) switchToMacros(r);
            else if (actionStr.includes("shopping") || actionStr.includes("course")) switchToShopping(r);
            else if (actionStr.includes("calendar") || actionStr.includes("planning") || actionStr.includes("calendrier")) switchToCalendar(r);
            chat.scrollTop = chat.scrollHeight;
        } catch(e) {
            const indicator = document.getElementById('tyler-typing-indicator');
            if (indicator) indicator.remove();
            if (chat) {
                chat.innerHTML += `<div class="text-red-400 text-xs italic p-2">⚠️ Échec de la communication avec Tyler.</div>`;
                chat.scrollTop = chat.scrollHeight;
            }
        }
    }

    function showView(viewId) {
        const views = ['view-chat', 'view-cooking', 'view-macros', 'view-shopping', 'view-training', 'view-calendar', 'view-profile', 'view-rapport'];
        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id === viewId) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        });
        const btnPlus = document.getElementById('floating-plus');
        if (btnPlus) {
            if (viewId === 'view-cooking') { btnPlus.classList.remove('hidden'); btnPlus.style.display = 'flex'; }
            else { btnPlus.classList.add('hidden'); btnPlus.style.display = 'none'; }
        }
        const btnShoppingPlus = document.getElementById('floating-shopping-plus');
        if (btnShoppingPlus) {
            if (viewId === 'view-shopping') { btnShoppingPlus.classList.remove('hidden'); btnShoppingPlus.style.display = 'flex'; }
            else { btnShoppingPlus.classList.add('hidden'); btnShoppingPlus.style.display = 'none'; }
        }
        const btnRapportChart = document.getElementById('floating-rapport-chart');
        if (btnRapportChart) {
            if (viewId === 'view-rapport') { btnRapportChart.classList.remove('hidden'); btnRapportChart.style.display = 'flex'; }
            else { btnRapportChart.classList.add('hidden'); btnRapportChart.style.display = 'none'; }
        }
    }

async function triggerQuickAction(type) {
    const targetViewId = type === 'cuisine' ? 'view-cooking' : type === 'macros' ? 'view-macros' : type === 'training' ? 'view-training' : type === 'calendar' ? 'view-calendar' : type === 'courses' ? 'view-shopping' : type === 'rapport' ? 'view-rapport' : 'view-shopping';
    showView(targetViewId);
    
    const container = document.getElementById(targetViewId);
    if (!container) return;
    
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-3 text-cyan-400 text-xs tracking-widest uppercase animate-pulse">
            <i data-lucide="loader" class="w-5 h-5 animate-spin"></i>
            <span>Chargement FitBuddy...</span>
        </div>`;
    if (window.lucide) lucide.createIcons();

    try {
        const currentName = localStorage.getItem('fitbuddy_user_name');
        
        if (type === 'rapport') {
            try {
                const res = await fetch(`${N8N_URL}/webhook/quick-action`, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" }, 
                    body: JSON.stringify({ action: 'rapport', email: userEmail, userName: currentName, nom: currentName }) 
                });
                const responseData = await res.json();
                const r = Array.isArray(responseData) ? responseData[0] : responseData;
                switchToRapport(r);
            } catch (err) {
                console.warn("Rapport live fetch failed, using local fallback", err);
                let cachedProfile = null;
                try {
                    cachedProfile = JSON.parse(localStorage.getItem('fitbuddy_user_profile'));
                } catch(eCache) {}
                switchToRapport({ profile: cachedProfile, veille: null, historique: null });
            }
            return;
        }

        if (type === 'calendar' && (!recipesCache || recipesCache.length === 0)) {
            try {
                const resRecettes = await fetch(`${N8N_URL}/webhook/quick-action`, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" }, 
                    body: JSON.stringify({ 
                        action: 'cuisine', 
                        email: userEmail, 
                        userName: currentName, 
                        nom: currentName 
                    }) 
                });
                const dataRecettes = await resRecettes.json();
                const rRecettes = Array.isArray(dataRecettes) ? dataRecettes[0] : dataRecettes;
                const dRecettes = rRecettes.data || rRecettes;
                recipesCache = Array.isArray(dRecettes) ? dRecettes : (dRecettes.recipes || []);
            } catch (eCache) {
                console.warn("Impossible de pré-charger le cache des recettes pour le calendrier:", eCache);
            }
        }

        const res = await fetch(`${N8N_URL}/webhook/quick-action`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" }, 
            body: JSON.stringify({ 
                action: type, 
                email: userEmail, 
                userName: type === 'macros' ? userEmail : currentName,
                nom: type === 'macros' ? userEmail : currentName,
                groupe: currentGroupName
            }) 
        });
        
        const responseData = await res.json();
        const r = Array.isArray(responseData) ? responseData[0] : responseData;

        if (type === 'cuisine') switchToCooking(r);
        else if (type === 'macros') switchToMacros(r);
        else if (type === 'courses') switchToShopping(r);
        else if (type === 'training') switchToTraining(r);
        else if (type === 'calendar') switchToCalendar(r);
        
    } catch(e) {
        console.error("Erreur triggerQuickAction:", e);
        container.innerHTML = `<div class="flex items-center justify-center h-full text-red-400 text-xs">⚠️ Erreur de chargement.</div>`;
    }
}

function recalculateMacros() {
    let totalKcal = 0, totalP = 0, totalG = 0, totalL = 0;
    const partsSelect = document.getElementById('recipe-parts-select');
    const parts = partsSelect ? (parseFloat(partsSelect.value) || 1) : 1;

    document.querySelectorAll('.ingredient-row').forEach(row => {
        const qteInput = row.querySelector('.ingredient-qte');
        const unitSelect = row.querySelector('.ingredient-unit');
        const qteSaisie = qteInput ? (parseFloat(qteInput.value) || 0) : 0;
        const unit = unitSelect ? unitSelect.value : "Grammes";
        const poidsRef = parseFloat(row.dataset.poidsRef) || 0;

        // Conversion en grammes pour le calcul des macros
        const qteGrammes = (unit === "Grammes") ? qteSaisie : (qteSaisie * poidsRef);

        totalKcal += qteGrammes * parseFloat(row.dataset.rkcal || 0);
        totalP += qteGrammes * parseFloat(row.dataset.rp || 0);
        totalG += qteGrammes * parseFloat(row.dataset.rg || 0);
        totalL += qteGrammes * parseFloat(row.dataset.rl || 0);
    });

    const dKcal = document.getElementById('display-kcal');
    const dProt = document.getElementById('display-prot');
    const dGlu = document.getElementById('display-glu');
    const dLip = document.getElementById('display-lip');

    if(dKcal) dKcal.innerText = (totalKcal / parts).toFixed(1);
    if(dProt) dProt.innerText = (totalP / parts).toFixed(1);
    if(dGlu) dGlu.innerText = (totalG / parts).toFixed(1);
    if(dLip) dLip.innerText = (totalL / parts).toFixed(1);
}

function recalculateDuration() {
        let total = 0;
        document.querySelectorAll('#steps-container .step-duration').forEach(input => {
            total += parseInt(input.value) || 0;
        });
        const badge = document.querySelector('.info-circle span.text-white:not([id])');
        if (badge) badge.innerText = total;
    }

function openIngredientSearchModal(row = null) {
        console.log("DEBUG: openIngredientSearchModal called with row:", row);
        activeEditingRow = row;
        if (row !== null) {
            searchModalMode = "recipe";
        }
        const modal = document.getElementById('ingredient-search-modal');
        console.log("DEBUG: modal element found:", modal);
        if (modal) {
            modal.style.display = 'flex';
            console.log("DEBUG: modal display set to flex!");
        } else {
            console.error("DEBUG ERROR: ingredient-search-modal not found in DOM!");
        }
        const input = document.getElementById('ingredient-search-input');
        console.log("DEBUG: input element found:", input);
        if (input) {
            input.value = "";
            if (searchModalMode === "macro") {
                input.placeholder = "Rechercher un aliment aux macros...";
            } else {
                input.placeholder = "Rechercher un ingrédient...";
            }
            document.getElementById('ingredient-search-results').innerHTML = '<p class="text-[10px] text-white/20 text-center py-4 italic">Saisissez au moins 2 caractères pour rechercher</p>';
            setTimeout(() => input.focus(), 100);
        }

        const btnCustom = document.getElementById('btn-custom-ingredient');
        if (btnCustom) {
            if (searchModalMode === "macro") {
                btnCustom.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> Ajouter et consommer cet aliment`;
            } else {
                btnCustom.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> Ajouter un ingrédient personnalisé`;
            }
            btnCustom.onclick = () => {
                const query = document.getElementById('ingredient-search-input').value.trim();
                openNewAlimentModal(query);
            };
        }

        if (window.lucide) lucide.createIcons();
    }

    function closeIngredientSearchModal() {
        activeEditingRow = null;
        document.getElementById('ingredient-search-modal').style.display = 'none';
    }

    let modalSearchTimeout;
    async function handleIngredientSearchModalInput(input) {
        const query = input.value.trim();
        
        // Dynamically update custom button text
        const btnCustom = document.getElementById('btn-custom-ingredient');
        if (btnCustom) {
            if (query) {
                btnCustom.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> Ajouter "${query}"`;
            } else {
                if (searchModalMode === "macro") {
                    btnCustom.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> Ajouter un aliment personnalisé`;
                } else {
                    btnCustom.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> Ajouter un ingrédient personnalisé`;
                }
            }
            if (window.lucide) lucide.createIcons();
        }

        const resultsContainer = document.getElementById('ingredient-search-results');
        if (!resultsContainer) return;

        if (query.length < 2) {
            resultsContainer.innerHTML = '<p class="text-[10px] text-white/20 text-center py-4 italic">Saisissez au moins 2 caractères pour rechercher</p>';
            return;
        }

        clearTimeout(modalSearchTimeout);
        resultsContainer.innerHTML = '<div class="text-center py-4"><i data-lucide="loader" class="w-5 h-5 animate-spin text-cyan-400 mx-auto"></i></div>';
        if (window.lucide) lucide.createIcons();

        modalSearchTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`${N8N_URL}/webhook/search-aliments`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" }, 
                    body: JSON.stringify({ q: query })
                });
                const aliments = await res.json();
                
                if (aliments && aliments.length > 0) {
                    resultsContainer.innerHTML = aliments.map(a => {
                        const nameEscaped = a.nom.replace(/'/g, "\\'");
                        const uniteSpeEscaped = (a.unite_spe || '').replace(/'/g, "\\'");
                        
                        let clickHandler = "";
                        if (searchModalMode === "macro") {
                            clickHandler = `openConsumeFoodQtyModal('${a.id}', '${nameEscaped}', ${a.kcal_100g || 0}, ${a.prot_100g || 0}, ${a.gluc_100g || 0}, ${a.lip_100g || 0}, '${uniteSpeEscaped}', ${a.poids_ref || 1})`;
                        } else {
                            clickHandler = `selectIngredientFromModal('${a.id}', '${nameEscaped}', ${a.kcal_100g || 0}, ${a.prot_100g || 0}, ${a.gluc_100g || 0}, ${a.lip_100g || 0}, '${uniteSpeEscaped}', ${a.poids_ref || 1})`;
                        }
                        
                        return `
                        <div class="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between cursor-pointer hover:bg-cyan-500/10 active:scale-[0.98] transition-all"
                             onclick="${clickHandler}">
                            <div class="text-left pr-4">
                                <p class="text-xs font-bold text-white">${a.nom}</p>
                                <p class="text-[9px] text-white/40 mt-0.5">${a.unite_spe ? `1 ${a.unite_spe} = ${a.poids_ref}g | ` : ''}${a.kcal_100g} kcal/100g</p>
                            </div>
                            <i data-lucide="plus" class="w-4 h-4 text-cyan-400 flex-none"></i>
                        </div>
                        `;
                    }).join('');
                } else {
                    resultsContainer.innerHTML = '<p class="text-[10px] text-white/20 text-center py-4 italic">Aucun aliment trouvé</p>';
                }
            } catch (e) {
                resultsContainer.innerHTML = '<p class="text-[10px] text-red-400 text-center py-4 italic">Erreur lors de la recherche</p>';
            } finally {
                if (window.lucide) lucide.createIcons();
            }
        }, 300);
    }

    function selectIngredientFromModal(id, nom, kcal100, p100, g100, l100, uniteSpe = "", poidsRef = 0) {
        const ratios = {
            kcal: kcal100 / 100,
            p: p100 / 100,
            g: g100 / 100,
            l: l100 / 100
        };

        const defaultQte = uniteSpe && uniteSpe !== "Grammes" ? 1 : 100;
        const defaultUnit = uniteSpe && uniteSpe !== "Grammes" ? uniteSpe : "Grammes";

        if (activeEditingRow) {
            const row = activeEditingRow;
            row.dataset.alimentId = id;
            row.dataset.rkcal = ratios.kcal;
            row.dataset.rp = ratios.p;
            row.dataset.rg = ratios.g;
            row.dataset.rl = ratios.l;
            row.dataset.uniteSpe = uniteSpe;
            row.dataset.poidsRef = poidsRef;

            const inputName = row.querySelector('.ingredient-name');
            if (inputName) {
                inputName.value = nom;
                if (id) {
                    inputName.setAttribute('readonly', 'true');
                    inputName.classList.add('cursor-pointer');
                    inputName.onclick = () => openIngredientSearchModal(row);
                    inputName.oninput = null;
                } else {
                    inputName.removeAttribute('readonly');
                    inputName.classList.remove('cursor-pointer');
                    inputName.onclick = null;
                    inputName.oninput = () => recalculateMacros();
                }
            }

            const unitSelect = row.querySelector('.ingredient-unit');
            let options = `<option value="Grammes">g</option>`;
            let currentUnit = "Grammes";
            if (uniteSpe && uniteSpe !== "Grammes") {
                options += `<option value="${uniteSpe}">${uniteSpe}</option>`;
                currentUnit = uniteSpe;
            }
            if (unitSelect) {
                unitSelect.innerHTML = options;
                unitSelect.value = currentUnit;
                unitSelect.dataset.currentUnit = currentUnit;
            }

            const qteInput = row.querySelector('.ingredient-qte');
            if (qteInput) {
                qteInput.value = defaultQte;
            }

            const container = row.querySelector('.ingredient-container');
            const errorMsg = row.querySelector('.error-msg');
            if (container) container.classList.remove('border-red-500/50', 'bg-red-500/5');
            if (errorMsg) errorMsg.classList.add('hidden');

            closeIngredientSearchModal();
            recalculateMacros();
        } else {
            const container = document.getElementById('ingredients-container');
            if (!container) return;
            if (!container.querySelector('.ingredient-row')) container.innerHTML = '';

            const rowHtml = renderIngredientRow(
                nom, 
                defaultQte, 
                ratios, 
                null, 
                id, 
                uniteSpe, 
                poidsRef, 
                defaultUnit
            );

            container.insertAdjacentHTML('beforeend', rowHtml);
            closeIngredientSearchModal();
            lucide.createIcons();
            recalculateMacros();
        }
    }

    function addCustomIngredientFromModal() {
        const container = document.getElementById('ingredients-container');
        if (!container) return;
        if (!container.querySelector('.ingredient-row')) container.innerHTML = '';

        const rowHtml = renderIngredientRow("", "", {kcal:0, p:0, g:0, l:0}, null, "", "", 0, "Grammes");
        container.insertAdjacentHTML('beforeend', rowHtml);
        closeIngredientSearchModal();
        lucide.createIcons();
        recalculateMacros();
    }

    /* --- NOUVELLES FONCTIONS : FICHE NUTRITIONNELLE IA & SUIVI MACRO INDIVIDUEL --- */

    function openMacroFoodPicker() {
        searchModalMode = "macro";
        openIngredientSearchModal(null);
    }

    function openNewAlimentModal(prefilledName = "") {
        const nameInput = document.getElementById('new-aliment-name');
        if (nameInput) {
            nameInput.value = prefilledName;
        }
        
        // Reset and clear inputs
        const kcalInput = document.getElementById('new-aliment-kcal');
        const protInput = document.getElementById('new-aliment-prot');
        const glucInput = document.getElementById('new-aliment-gluc');
        const lipInput = document.getElementById('new-aliment-lip');
        const unitInput = document.getElementById('new-aliment-unit');
        const poidsRefInput = document.getElementById('new-aliment-poids-ref');
        const logCheck = document.getElementById('new-aliment-log-check');
        const logQty = document.getElementById('new-aliment-log-qty');
        const fileInput = document.getElementById('nutrition-label-file');
        
        if (kcalInput) kcalInput.value = "";
        if (protInput) protInput.value = "";
        if (glucInput) glucInput.value = "";
        if (lipInput) lipInput.value = "";
        if (unitInput) unitInput.value = "Grammes";
        if (poidsRefInput) poidsRefInput.value = 1;
        if (fileInput) fileInput.value = "";
        
        // Toggle the "J'ai mangé cet aliment" checkbox visibility based on mode
        const logCheckboxContainer = document.getElementById('new-aliment-log-checkbox-container');
        if (logCheckboxContainer) {
            if (searchModalMode === "macro") {
                logCheckboxContainer.classList.remove('hidden');
                if (logCheck) logCheck.checked = true;
            } else {
                logCheckboxContainer.classList.add('hidden');
                if (logCheck) logCheck.checked = false;
            }
        }
        
        if (logQty) logQty.value = 100;
        
        togglePoidsRefField();
        toggleNewAlimentLogQty();
        
        const modal = document.getElementById('new-aliment-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
        if (window.lucide) lucide.createIcons();
    }

    function closeNewAlimentModal() {
        const modal = document.getElementById('new-aliment-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function togglePoidsRefField() {
        const unitSelect = document.getElementById('new-aliment-unit');
        const poidsRefContainer = document.getElementById('new-aliment-poids-ref-container');
        const poidsRefInput = document.getElementById('new-aliment-poids-ref');
        
        if (unitSelect && unitSelect.value === 'Grammes') {
            if (poidsRefContainer) poidsRefContainer.classList.add('hidden');
            if (poidsRefInput) poidsRefInput.value = 1;
        } else {
            if (poidsRefContainer) poidsRefContainer.classList.remove('hidden');
            if (poidsRefInput && poidsRefInput.value === "1") poidsRefInput.value = "";
        }
        toggleNewAlimentLogQty();
    }

    function toggleNewAlimentLogQty() {
        const logCheck = document.getElementById('new-aliment-log-check');
        const qtyContainer = document.getElementById('new-aliment-log-qty-container');
        const unitSelect = document.getElementById('new-aliment-unit');
        const logUnitSelect = document.getElementById('new-aliment-log-unit-select');
        const logQtyInput = document.getElementById('new-aliment-log-qty');
        
        if (logCheck && logCheck.checked) {
            if (qtyContainer) qtyContainer.classList.remove('hidden');
            if (logUnitSelect && unitSelect) {
                let options = `<option value="Grammes">g</option>`;
                const unitVal = unitSelect.value;
                if (unitVal && unitVal !== "Grammes") {
                    options += `<option value="${unitVal}">${unitVal}</option>`;
                }
                logUnitSelect.innerHTML = options;
                if (unitVal && unitVal !== "Grammes") {
                    logUnitSelect.value = unitVal;
                    if (logQtyInput && (logQtyInput.value === "100" || logQtyInput.value === "")) logQtyInput.value = 1;
                } else {
                    logUnitSelect.value = "Grammes";
                    if (logQtyInput && (logQtyInput.value === "1" || logQtyInput.value === "")) logQtyInput.value = 100;
                }
            }
        } else {
            if (qtyContainer) qtyContainer.classList.add('hidden');
        }
    }

    function compressAndResizeImage(file, maxDimension = 1024, quality = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    
                    // Maintain aspect ratio
                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = Math.round((height * maxDimension) / width);
                            width = maxDimension;
                        } else {
                            width = Math.round((width * maxDimension) / height);
                            height = maxDimension;
                        }
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(compressedFile);
                        } else {
                            reject(new Error("Image compression failed"));
                        }
                    }, 'image/jpeg', quality);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    }

    async function analyzeNutritionLabel(input) {
        if (!input.files || input.files.length === 0) return;
        let file = input.files[0];
        
        const btnCamera = document.getElementById('btn-analyze-camera');
        const btnGallery = document.getElementById('btn-analyze-gallery');
        const originalTextCamera = btnCamera ? btnCamera.innerHTML : "Appareil Photo";
        const originalTextGallery = btnGallery ? btnGallery.innerHTML : "Galerie";
        
        if (btnCamera) {
            btnCamera.disabled = true;
            btnCamera.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Compression...`;
        }
        if (btnGallery) {
            btnGallery.disabled = true;
            btnGallery.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Compression...`;
        }
        if (window.lucide) lucide.createIcons();
        
        try {
            // Compress and resize image if it is an image file
            if (file.type.startsWith('image/')) {
                try {
                    file = await compressAndResizeImage(file, 1600, 0.85);
                    console.log("Image compressed successfully. New size:", (file.size / 1024).toFixed(1) + " KB");
                } catch (compressErr) {
                    console.warn("Failed to compress image, sending original file:", compressErr);
                }
            }
            
            if (btnCamera) {
                btnCamera.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Analyse...`;
            }
            if (btnGallery) {
                btnGallery.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Analyse...`;
            }
            if (window.lucide) lucide.createIcons();
            
            const formData = new FormData();
            formData.append('file', file);
            
            const res = await fetch(`${N8N_URL}/webhook/analyze-nutrition-label`, {
                method: 'POST',
                headers: { "ngrok-skip-browser-warning": "69420" },
                body: formData
            });
            const data = await res.json();
            
            // Accept both short-form (kcal/p/g/l) and long-form keys
            const kcal = data.kcal || data.calories || 0;
            const prot = data.p || data.prot || data.proteines || 0;
            const gluc = data.g || data.gluc || data.glucides || 0;
            const lip = data.l || data.lip || data.lipides || 0;
            
            const kcalInput = document.getElementById('new-aliment-kcal');
            const protInput = document.getElementById('new-aliment-prot');
            const glucInput = document.getElementById('new-aliment-gluc');
            const lipInput = document.getElementById('new-aliment-lip');
            
            if (kcalInput) kcalInput.value = kcal;
            if (protInput) protInput.value = prot;
            if (glucInput) glucInput.value = gluc;
            if (lipInput) lipInput.value = lip;
            
        } catch (e) {
            console.error("Erreur d'analyse d'image par l'IA:", e);
            alert("Erreur lors de l'analyse de l'image. Veuillez saisir les valeurs manuellement.");
        } finally {
            if (btnCamera) {
                btnCamera.disabled = false;
                btnCamera.innerHTML = originalTextCamera;
            }
            if (btnGallery) {
                btnGallery.disabled = false;
                btnGallery.innerHTML = originalTextGallery;
            }
            if (window.lucide) lucide.createIcons();
        }
    }

    async function submitNewAliment() {
        const nom = document.getElementById('new-aliment-name').value.trim();
        const kcal = parseFloat(document.getElementById('new-aliment-kcal').value) || 0;
        const prot = parseFloat(document.getElementById('new-aliment-prot').value) || 0;
        const gluc = parseFloat(document.getElementById('new-aliment-gluc').value) || 0;
        const lip = parseFloat(document.getElementById('new-aliment-lip').value) || 0;
        const unite_spe = document.getElementById('new-aliment-unit').value;
        const poids_ref = parseFloat(document.getElementById('new-aliment-poids-ref').value) || 1;
        
        if (!nom) {
            alert("Veuillez saisir un nom pour l'aliment.");
            return;
        }
        
        const logCheck = document.getElementById('new-aliment-log-check');
        const isLogged = logCheck && logCheck.checked;
        
        const btn = document.getElementById('btn-confirm-new-aliment');
        let originalContentSubmitAliment = "";
        if (btn) {
            btn.disabled = true;
            originalContentSubmitAliment = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Création...`;
            if (window.lucide) lucide.createIcons();
        }
        
        try {
            if (isLogged) {
                const qte = parseFloat(document.getElementById('new-aliment-log-qty').value) || 1;
                const uniteConso = document.getElementById('new-aliment-log-unit-select').value;
                
                let rawWeight = qte;
                if (uniteConso !== 'Grammes') {
                    rawWeight = qte * poids_ref;
                }
                
                const total_kcal = (kcal / 100) * rawWeight;
                const total_prot = (prot / 100) * rawWeight;
                const total_glu = (gluc / 100) * rawWeight;
                const total_lip = (lip / 100) * rawWeight;
                
                const payload = {
                    email: userEmail,
                    userName: userEmail,
                    nom: nom,
                    kcal: kcal,
                    prot: prot,
                    gluc: gluc,
                    lip: lip,
                    kcal_100g: kcal,
                    prot_100g: prot,
                    gluc_100g: gluc,
                    lip_100g: lip,
                    unite_spe: unite_spe,
                    poids_ref: poids_ref,
                    quantite: qte,
                    unite: uniteConso,
                    total_kcal: total_kcal,
                    total_prot: total_prot,
                    total_glu: total_glu,
                    total_lip: total_lip,
                    timestamp: new Date().toISOString()
                };
                
                let res;
                let isWebhookAvailable = true;
                try {
                    res = await fetch(`${N8N_URL}/webhook/add-and-log-aliment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" },
                        body: JSON.stringify(payload)
                    });
                    if (res.status === 404) {
                        isWebhookAvailable = false;
                    }
                } catch (fetchErr) {
                    isWebhookAvailable = false;
                }
                
                // Fallback to Webhook 1 (add-aliment) if Webhook 4 (add-and-log-aliment) is not active yet!
                if (!isWebhookAvailable || (res && !res.ok && res.status !== 500)) {
                    console.log("add-and-log-aliment (Webhook 4) not available or failed. Falling back to add-aliment (Webhook 1)...");
                    
                    const fallbackPayload = {
                        email: userEmail,
                        nom: nom,
                        kcal: kcal,
                        prot: prot,
                        gluc: gluc,
                        lip: lip,
                        unite_spe: unite_spe,
                        poids_ref: poids_ref
                    };
                    
                    const resAdd = await fetch(`${N8N_URL}/webhook/add-aliment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" },
                        body: JSON.stringify(fallbackPayload)
                    });
                    
                    if (!resAdd.ok) throw new Error("Erreur de sauvegarde fallback");
                    
                    alert("Aliment créé dans la base Notion ! Note : La consommation n'a pas pu être enregistrée car le webhook de suivi macro (webhook 4) n'est pas encore créé sur n8n.");
                    closeNewAlimentModal();
                    closeIngredientSearchModal();
                    return;
                }
                
                if (res && !res.ok) throw new Error("Erreur de sauvegarde et log");
                
                closeNewAlimentModal();
                closeIngredientSearchModal();
                triggerQuickAction('macros');
            } else {
                const payload = {
                    email: userEmail,
                    nom: nom,
                    kcal: kcal,
                    prot: prot,
                    gluc: gluc,
                    lip: lip,
                    unite_spe: unite_spe,
                    poids_ref: poids_ref
                };
                
                const res = await fetch(`${N8N_URL}/webhook/add-aliment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" },
                    body: JSON.stringify(payload)
                });
                
                if (!res.ok) throw new Error("Erreur de sauvegarde");
                
                // Robust parsing to handle non-JSON or default n8n "Workflow started" text responses safely
                let returnId = "";
                try {
                    const responseText = await res.text();
                    try {
                        const newAliment = JSON.parse(responseText);
                        const dataObj = Array.isArray(newAliment) ? newAliment[0] : newAliment;
                        returnId = dataObj.id || dataObj.pageId || "";
                    } catch (jsonErr) {
                        console.warn("Could not parse n8n webhook response as JSON (default response text?). Falling back to custom row.", jsonErr);
                    }
                } catch (textErr) {
                    console.warn("Failed to read response body text.", textErr);
                }
                
                closeNewAlimentModal();
                
                if (searchModalMode === "recipe") {
                    selectIngredientFromModal(
                        returnId, 
                        nom, 
                        kcal, 
                        prot, 
                        gluc, 
                        lip, 
                        unite_spe, 
                        poids_ref
                    );
                } else {
                    closeIngredientSearchModal();
                }
            }
        } catch (err) {
            console.error("Erreur d'ajout de l'aliment:", err);
            alert("Erreur lors de la création de l'aliment. Veuillez réessayer.");
        } finally {
            if (btn) {
                btn.disabled = false;
                if (originalContentSubmitAliment) btn.innerHTML = originalContentSubmitAliment;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    function openConsumeFoodQtyModal(id, nom, kcal100, prot100, gluc100, lip100, uniteSpe, poidsRef) {
        activeConsumedFood = { 
            id: id, 
            nom: nom, 
            kcal_100g: kcal100, 
            prot_100g: prot100, 
            gluc_100g: gluc100, 
            lip_100g: lip100, 
            unite_spe: uniteSpe, 
            poids_ref: poidsRef 
        };
        
        const nameText = document.getElementById('consume-qty-food-name');
        if (nameText) nameText.innerText = nom;
        
        const unitSelect = document.getElementById('consume-qty-unit-select');
        const qtyInput = document.getElementById('consume-qty-value');
        
        if (unitSelect) {
            let options = `<option value="Grammes">g (Grammes)</option>`;
            if (uniteSpe && uniteSpe !== "Grammes") {
                options += `<option value="${uniteSpe}">${uniteSpe}</option>`;
            }
            unitSelect.innerHTML = options;
            
            if (uniteSpe && uniteSpe !== "Grammes") {
                unitSelect.value = uniteSpe;
                if (qtyInput) qtyInput.value = 1;
            } else {
                unitSelect.value = "Grammes";
                if (qtyInput) qtyInput.value = 100;
            }

            unitSelect.onchange = () => {
                if (qtyInput) {
                    if (unitSelect.value === "Grammes") {
                        qtyInput.value = 100;
                    } else {
                        qtyInput.value = 1;
                    }
                }
            };
        }
        
        const modal = document.getElementById('consume-food-qty-modal');
        if (modal) modal.style.display = 'flex';
        
        if (window.lucide) lucide.createIcons();
    }

    function closeConsumeFoodQtyModal() {
        activeConsumedFood = null;
        const modal = document.getElementById('consume-food-qty-modal');
        if (modal) modal.style.display = 'none';
    }

    async function submitConsumeFoodQty() {
        if (!activeConsumedFood) return;
        
        const qtyVal = parseFloat(document.getElementById('consume-qty-value').value) || 0;
        const unitVal = document.getElementById('consume-qty-unit-select').value;
        
        if (qtyVal <= 0) {
            alert("Veuillez saisir une quantité supérieure à 0.");
            return;
        }
        
        const btn = document.getElementById('btn-confirm-consume-qty');
        let originalContentLogFood = "";
        if (btn) {
            btn.disabled = true;
            originalContentLogFood = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Enregistrement...`;
            if (window.lucide) lucide.createIcons();
        }
        
        try {
            const poids_ref = activeConsumedFood.poids_ref || 1;
            let rawWeight = qtyVal;
            if (unitVal !== 'Grammes') {
                rawWeight = qtyVal * poids_ref;
            }
            
            const total_kcal = (activeConsumedFood.kcal_100g / 100) * rawWeight;
            const total_prot = (activeConsumedFood.prot_100g / 100) * rawWeight;
            const total_glu = (activeConsumedFood.gluc_100g / 100) * rawWeight;
            const total_lip = (activeConsumedFood.lip_100g / 100) * rawWeight;
            
            const payload = {
                email: userEmail,
                userName: userEmail,
                alimentId: activeConsumedFood.id,
                nom: activeConsumedFood.nom,
                kcal_100g: activeConsumedFood.kcal_100g,
                prot_100g: activeConsumedFood.prot_100g,
                gluc_100g: activeConsumedFood.gluc_100g,
                lip_100g: activeConsumedFood.lip_100g,
                kcal: activeConsumedFood.kcal_100g,
                prot: activeConsumedFood.prot_100g,
                gluc: activeConsumedFood.gluc_100g,
                lip: activeConsumedFood.lip_100g,
                quantite: qtyVal,
                unite: unitVal,
                total_kcal: total_kcal,
                total_prot: total_prot,
                total_glu: total_glu,
                total_lip: total_lip,
                timestamp: new Date().toISOString()
            };
            
            const res = await fetch(`${N8N_URL}/webhook/log-consumed-food`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) throw new Error("Erreur de log consommation");
            
            closeConsumeFoodQtyModal();
            closeIngredientSearchModal();
            triggerQuickAction('macros');
        } catch (err) {
            console.error("Erreur de log consommation aliment:", err);
            alert("Erreur lors de l'enregistrement de votre consommation. Veuillez réessayer.");
        } finally {
            if (btn) {
                btn.disabled = false;
                if (originalContentLogFood) btn.innerHTML = originalContentLogFood;
                if (window.lucide) lucide.createIcons();
            }
        }
    }



    function switchToTraining(data) {
        moveToHeader("agent-training.mp4");
        showView('view-training');
        document.getElementById('floating-plus').classList.add('hidden');
        const container = document.getElementById('view-training');
        if(!container) return;

        const d = data.data || data;
        const utilisateurs = d.utilisateurs || [];
        const prog = d.programme_actif || {};
        const autresProgrammes = d.autres_programmes || [];
        const exercices = prog.exercices || [];
        const progres = Math.min(Math.max(parseFloat(prog.progres) || 0, 0), 100);
        const intensite = prog.intensite || "—";
        const nomProg = prog.nom || "Programme";

        const typeIcon = { musculation: "dumbbell", cardio: "heart-pulse", yoga: "flame", natation: "waves" };
        const R = 32, CIRC = 2 * Math.PI * R;
        const dash = (progres / 100) * CIRC;
        const intensiteColor = { Faible: "#22c55e", Moyenne: "#f59e0b", "Élevée": "#ef4444", Maximale: "#a855f7" };
        const iColor = intensiteColor[intensite] || "#22d3ee";

        const coachesHtml = utilisateurs.length > 0 ? `
        <section class="px-4 pb-2">
            <p class="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Utilisateur</p>
            <div class="flex gap-3 overflow-x-auto no-scrollbar snap-x">
                ${utilisateurs.map(u => {
                    const initiales = u.nom.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                    const colors = { Djibril: '#6366f1', Maxime: '#22d3ee', Sami: '#f59e0b' };
                    const bg = colors[u.nom] || '#6b7280';
                    return `<div class="coach-card flex flex-col items-center gap-2 ${u.selected ? 'selected' : ''}" onclick="selectUtilisateur('${u.nom}', this)">
                        <div class="coach-avatar-wrap flex items-center justify-center" style="background: ${bg}22; border-color: ${u.selected ? bg : 'rgba(255,255,255,0.08)'};">
                            <span class="text-[18px] font-black" style="color: ${bg}">${initiales}</span>
                        </div>
                        <p class="text-[9px] font-bold text-center leading-tight whitespace-nowrap" style="color: ${u.selected ? bg : 'rgba(255,255,255,0.4)'}">${u.nom}</p>
                        ${u.selected ? `<div class="w-1 h-1 rounded-full" style="background: ${bg}"></div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </section>` : '';

        const exercicesHtml = exercices.length > 0 ? exercices.map(ex => `
            <div id="ex-${ex.id}" class="exercise-pill ${ex.fait ? 'done' : ''}" onclick="toggleExercise('${ex.id}', '${prog.id}')">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-none" style="background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.15);">
                    <i data-lucide="dumbbell" class="w-3.5 h-3.5 text-cyan-400"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-[12px] font-bold text-white/90 leading-tight">${ex.nom}</p>
                    <p class="text-[9px] text-white/40 font-medium">${ex.series} séries × ${ex.reps} reps</p>
                </div>
                <div id="check-${ex.id}" class="w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${ex.fait ? 'bg-cyan-500' : 'border border-white/15'}">
                    ${ex.fait ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                </div>
            </div>`).join('') : `<p class="text-[10px] text-white/20 text-center py-4 italic">Aucun exercice défini</p>`;

        const autresHtml = autresProgrammes.length > 0 ? autresProgrammes.map(p => {
            const icon = typeIcon[p.type] || "list";
            return `<div class="other-program-row ${p.actif ? 'active-prog' : ''}" onclick="activerProgramme('${p.id}', '${p.nom}')">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-none" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);">
                    <i data-lucide="${icon}" class="w-4 h-4 ${p.actif ? 'text-cyan-400' : 'text-white/40'}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-[12px] font-bold ${p.actif ? 'text-cyan-400' : 'text-white/80'} leading-tight truncate">${p.nom}</p>
                    <p class="text-[9px] font-medium capitalize" style="color: rgba(255,255,255,0.3)">${p.type || 'programme'}</p>
                </div>
                ${p.actif ? '<span class="text-[8px] font-black text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded-md uppercase">Actif</span>' : '<i data-lucide="chevron-right" class="w-4 h-4 text-white/20 flex-none"></i>'}
            </div>`;
        }).join('') : '';

        container.innerHTML = `
        <div class="space-y-6 pb-28 animate-in fade-in duration-500">
            ${coachesHtml}
            <section class="mx-4">
                <div class="flex justify-between items-center mb-3 px-1">
                    <div class="category-badge">
                        <i data-lucide="dumbbell" class="w-3.5 h-3.5 text-purple-400"></i>
                        <h2 class="text-[10px] font-black text-white uppercase tracking-[0.15em]">Training actuel</h2>
                    </div>
                </div>
                <div class="rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a]">
                    <div class="p-4 space-y-2.5">${exercicesHtml}</div>
                    <div class="flex items-center border-t border-white/5">
                        <div class="flex-1 flex flex-col items-center py-4 border-r border-white/5">
                            <p class="text-[8px] font-black text-white/30 uppercase tracking-widest mb-2">Progrès total</p>
                            <div class="training-stat-ring">
                                <svg width="80" height="80" viewBox="0 0 80 80">
                                    <circle cx="40" cy="40" r="${R}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="6"/>
                                    <circle cx="40" cy="40" r="${R}" fill="none" stroke="#22d3ee" stroke-width="6" stroke-dasharray="${dash} ${CIRC}" stroke-linecap="round" transform="rotate(-90 40 40)"/>
                                </svg>
                                <div class="absolute inset-0 flex items-center justify-center">
                                    <span class="text-[18px] font-black text-white">${Math.round(progres)}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex-1 flex flex-col items-center justify-center py-4 border-r border-white/5 gap-1.5">
                            <p class="text-[8px] font-black text-white/30 uppercase tracking-widest">Intensité</p>
                            <span class="text-[15px] font-black" style="color: ${iColor}">${intensite}</span>
                            <div class="flex gap-1 mt-1">
                                ${['Faible','Moyenne','Élevée','Maximale'].map((l, i) => {
                                    const levels = ['Faible','Moyenne','Élevée','Maximale'];
                                    const filled = levels.indexOf(intensite) >= i;
                                    return `<div class="w-5 h-1 rounded-full" style="background: ${filled ? iColor : 'rgba(255,255,255,0.08)'}"></div>`;
                                }).join('')}
                            </div>
                        </div>
                        <div class="flex-1 flex flex-col items-center justify-center py-4 gap-1.5 px-2 text-center">
                            <p class="text-[8px] font-black text-white/30 uppercase tracking-widest">Séance du jour</p>
                            <p class="text-[11px] font-black text-white leading-tight">${nomProg}</p>
                        </div>
                    </div>
                </div>
            </section>
            ${autresHtml ? `
            <section class="mx-4">
                <div class="flex justify-between items-center mb-3 px-1">
                    <div class="category-badge">
                        <i data-lucide="layout-list" class="w-3.5 h-3.5 text-white/50"></i>
                        <h2 class="text-[10px] font-black text-white/70 uppercase tracking-[0.15em]">Autres trainings</h2>
                    </div>
                </div>
                <div class="space-y-2">${autresHtml}</div>
            </section>` : ''}
            <div class="mx-4">
                <button onclick="creerNouveauTraining()" class="w-full py-5 rounded-2xl flex items-center justify-center gap-3 border border-cyan-500/40 bg-cyan-500/5 active:scale-95 transition-transform">
                    <i data-lucide="plus-circle" class="w-5 h-5 text-cyan-400"></i>
                    <span class="text-[13px] font-black text-cyan-400 uppercase tracking-widest">Créer un nouveau training</span>
                </button>
            </div>
        </div>`;
        lucide.createIcons();
        setTimeout(() => { container.scrollTo({ top: 0, behavior: 'instant' }); }, 100);
    }

    function selectUtilisateur(nom, el) {
        const colors = { Djibril: '#6366f1', Maxime: '#22d3ee', Sami: '#f59e0b' };
        const bg = colors[nom] || '#6b7280';
        document.querySelectorAll('.coach-card').forEach(c => {
            c.classList.remove('selected');
            const dot = c.querySelector('[style*="rounded-full"]');
            if (dot) dot.remove();
        });
        el.classList.add('selected');
        el.insertAdjacentHTML('beforeend', `<div class="w-1 h-1 rounded-full" style="background: ${bg}"></div>`);
        selectUser(nom);
    }

    function toggleExercise(exerciceId, programmeId) {
        const pill = document.getElementById(`ex-${exerciceId}`);
        const check = document.getElementById(`check-${exerciceId}`);
        if (!pill) return;
        const isDone = !pill.classList.contains('done');
        pill.classList.toggle('done', isDone);
        if (check) {
            check.className = `w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${isDone ? 'bg-cyan-500' : 'border border-white/15'}`;
            check.innerHTML = isDone ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '';
        }
        fetch(`${N8N_URL}/webhook/training-action`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: isDone ? 'exercice_fait' : 'exercice_annule', exerciceId, programmeId, email: userEmail, userName: localStorage.getItem('fitbuddy_user_name') })
        }).catch(() => {});
    }

    function activerProgramme(programmeId, programmeNom) {
        if (!confirm(`Activer le programme "${programmeNom}" ?`)) return;
        const loadingToast = showNotification(`Activation du programme "${programmeNom}"...`, "loading");
        fetch(`${N8N_URL}/webhook/training-action`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'activer_programme', programmeId, programmeNom, email: userEmail, userName: localStorage.getItem('fitbuddy_user_name') })
        }).then(() => {
            if (loadingToast) loadingToast.remove();
            showNotification(`Programme "${programmeNom}" activé !`, "success");
            triggerQuickAction('training');
        }).catch(() => {
            if (loadingToast) loadingToast.remove();
            showNotification("Erreur lors de l'activation du programme.", "error");
        });
    }

    function creerNouveauTraining() {
        const nomProg = prompt("Nom du nouveau programme :");
        if (!nomProg || !nomProg.trim()) return;
        const input = document.getElementById('userInput');
        if (input) { input.value = `Crée-moi un programme de training appelé "${nomProg.trim()}"`; envoyerMessage(); }
    }

async function sendRowToCart(buttonEl) {
    const row = buttonEl.closest('.ingredient-row');
    const nameInput = row.querySelector('.ingredient-name');
    const qteInput = row.querySelector('.ingredient-qte');
    const unitSelect = row.querySelector('.ingredient-unit'); // <-- AJOUT

    const nomProduit = nameInput ? nameInput.value.trim() : "";
    const quantiteGrames = parseFloat(qteInput ? qteInput.value : 0) || 0;
    const uniteProduit = unitSelect ? unitSelect.value : "Grammes"; // <-- AJOUT

    if (!nomProduit || quantiteGrames <= 0) {
        showNotification("L'ingrédient doit avoir un nom et une quantité supérieure à 0.", "error");
        return;
    }
    
    // NOUVEAU PAYLOAD AVEC L'UNITÉ
    const payload = { 
        email: userEmail, 
        userName: localStorage.getItem('fitbuddy_user_name') || "Utilisateur", 
        items: [{ produit: nomProduit, quantite: quantiteGrames, unite: uniteProduit }] 
    };
    
    const loadingToast = showNotification(`Ajout de ${quantiteGrames} ${uniteProduit} de ${nomProduit} au panier...`, "loading");

    try {
        buttonEl.disabled = true;
        buttonEl.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin text-amber-500"></i>';
        if (window.lucide) lucide.createIcons();

        const res = await fetch(`${N8N_URL}/webhook/add-to-cart`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        
        if (loadingToast) loadingToast.remove();
        if (res.ok) {
            showNotification(`Ajouté au panier : ${quantiteGrames} ${uniteProduit} de ${nomProduit}`, "success");
            const chat = document.getElementById('view-chat') || document.getElementById('chat');
            if (chat) {
                chat.innerHTML += `<div class="msg-agent p-4 max-w-[90%] text-xs shadow-xl animate-in fade-in">🛒 Ajouter au panier : <b>${quantiteGrames} ${uniteProduit} de ${nomProduit}</b></div>`;
                chat.scrollTop = chat.scrollHeight;
            }
        } else { showNotification("Erreur de traitement côté serveur.", "error"); }
    } catch (e) {
        if (loadingToast) loadingToast.remove();
        showNotification("Impossible de joindre le serveur FitBuddy.", "error");
    } finally {
        buttonEl.disabled = false; buttonEl.innerHTML = '<i data-lucide="shopping-cart" class="w-4 h-4"></i>';
        if (window.lucide) lucide.createIcons();
    }
}
async function sendRecipeToCart() {
    const btnGlobal = document.getElementById('btn-cart-recipe');
    const items = [];
    
    document.querySelectorAll('.ingredient-row').forEach(row => {
        const nameInput = row.querySelector('.ingredient-name');
        const qteInput = row.querySelector('.ingredient-qte');
        const unitSelect = row.querySelector('.ingredient-unit');
        
        const nom = nameInput ? nameInput.value.trim() : "";
        const qteSaisie = parseFloat(qteInput ? qteInput.value : 0) || 0;
        const uniteSaisie = unitSelect ? unitSelect.value : "Grammes";
        const poidsRef = parseFloat(row.dataset.poidsRef) || 0;
        
        let qteFinale = qteSaisie;
        let uniteFinale = uniteSaisie;

        // Conversion automatique en grammes pour uniformiser la liste de courses
        if (uniteSaisie !== "Grammes" && uniteSaisie !== "unité" && poidsRef > 0) {
            qteFinale = qteSaisie * poidsRef;
            // On arrondit pour éviter les décimales à rallonge sur la liste de courses
            qteFinale = Math.round(qteFinale); 
            uniteFinale = "Grammes";
        }
        
        if (nom.length > 0 && qteFinale > 0) {
            items.push({ produit: nom, quantite: qteFinale, unite: uniteFinale });
        }
    });

    if (items.length === 0) { showNotification("Aucun ingrédient valide à envoyer dans le panier.", "error"); return; }
    const recipeName = document.getElementById('recipe-name-input').value || "Recette sans nom";
    const payload = { email: userEmail, userName: localStorage.getItem('fitbuddy_user_name') || "Utilisateur", recipeName: recipeName, items: items };
    const loadingToast = showNotification(`Génération du panier pour "${recipeName}"...`, "loading");

    try {
        if (btnGlobal) {
            btnGlobal.disabled = true; btnGlobal.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin text-white"></i>';
            if (window.lucide) lucide.createIcons();
        }
        const res = await fetch(`${N8N_URL}/webhook/add-to-cart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (loadingToast) loadingToast.remove();
        if (res.ok) {
            closeRecipe();
            showNotification(`Les ${items.length} ingrédients ont été dispatchés dans Notion !`, "success");
            const chat = document.getElementById('view-chat') || document.getElementById('chat');
            if (chat) {
                chat.innerHTML += `<div class="msg-agent p-4 max-w-[90%] text-xs shadow-xl animate-in fade-in">🛒 Les <b>${items.length} ingrédients</b> de la recette ont été ajoutés au panier !</div>`;
                chat.scrollTop = chat.scrollHeight;
            }
        } else { showNotification("Le serveur a refusé l'importation de la liste.", "error"); }
    } catch (e) {
        if (loadingToast) loadingToast.remove();
        showNotification("Échec de la connexion réseau avec l'agent.", "error");
    } finally {
        if (btnGlobal) {
            btnGlobal.disabled = false; btnGlobal.innerHTML = '<i data-lucide="shopping-cart" class="w-5 h-5 text-white"></i>';
            if (window.lucide) lucide.createIcons();
        }
    }
}

    function showNotification(message, type = 'info') {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed top-16 left-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none';
            document.body.appendChild(toastContainer);
        }
        const toast = document.createElement('div');
        toast.style.transition = "all 0.3s ease-out";
        toast.className = 'p-4 rounded-2xl text-xs font-bold shadow-2xl border backdrop-blur-xl pointer-events-auto flex items-center gap-3 opacity-0 transform -translate-y-2';
        
        let bg, border, text, icon;
        if (type === 'success') { bg = 'bg-emerald-500/10'; border = 'border-emerald-500/30'; text = 'text-emerald-400'; icon = 'check-circle'; } 
        else if (type === 'error') { bg = 'bg-red-500/10'; border = 'border-red-500/30'; text = 'text-red-400'; icon = 'x-circle'; } 
        else { bg = 'bg-amber-500/10'; border = 'border-amber-500/30'; text = 'text-amber-400'; icon = 'loader'; }
        
        toast.className += ` ${bg} ${border} ${text}`;
        toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4 ${icon === 'loader' ? 'animate-spin' : ''}"></i> <span class="flex-1">${message}</span>`;
        toastContainer.appendChild(toast);
        if (window.lucide) lucide.createIcons();
        
        setTimeout(() => { toast.classList.remove('opacity-0', '-translate-y-2'); }, 10);
        if (type !== 'loading') {
            setTimeout(() => {
                toast.classList.add('opacity-0', '-translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
        return toast;
    }

    let recipePortions = {};   
    function openRecipePicker() {
        recipePortions = {};
        document.getElementById('recipe-picker-modal').style.display = 'flex';

        if (recipesCache && recipesCache.length > 0) { renderRecipePicker(); } 
        else {
            const pickerBody = document.getElementById('recipe-picker-body');
            if(pickerBody) {
                pickerBody.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-full gap-3 text-cyan-400 py-16">
                        <i data-lucide="loader" class="w-5 h-5 animate-spin"></i>
                        <span class="text-[10px] tracking-widest uppercase">Chargement des recettes…</span>
                    </div>`;
            }
            lucide.createIcons();

            fetch(`${N8N_URL}/webhook/quick-action`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
                body: JSON.stringify({ action: 'cuisine', email: userEmail, userName: localStorage.getItem('fitbuddy_user_name') })
            })
            .then(r => r.json())
            .then(data => {
                const r = Array.isArray(data) ? data[0] : data;
                const d = r.data || r;
                recipesCache = Array.isArray(d) ? d : (d.recipes || []);
                renderRecipePicker();
            })
            .catch(() => {
                const pickerBody = document.getElementById('recipe-picker-body');
                if(pickerBody) pickerBody.innerHTML = `<div class="text-center text-red-400 text-xs py-12">⚠️ Impossible de charger les recettes.</div>`;
            });
        }
    }

    function closeRecipePicker() { document.getElementById('recipe-picker-modal').style.display = 'none'; recipePortions = {}; }

    function renderRecipePicker() {
        const body = document.getElementById('recipe-picker-body');
        if(!body) return;
        
        // Filter recipes dynamically based on active user group or personal solo recipes
        const filtered = getFilteredItems(recipesCache, activeRecipeFilter);

        const unique = []; const seen = new Set();
        filtered.forEach(r => {
            const id = String(r.id);
            if (!seen.has(id) && (r.property_nom || r.name || r.nom)) { seen.add(id); unique.push(r); }
        });

        if (unique.length === 0) { body.innerHTML = `<p class="text-center text-white/30 text-xs py-12">Aucune recette disponible</p>`; return; }

        body.innerHTML = `<div class="grid grid-cols-2 gap-3 p-4 pb-6">${unique.map(r => {
            const id = String(r.id); const name = r.property_nom || r.name || r.nom || "Recette"; const kcal = parseFloat(r.property_kcal_part || 0).toFixed(0);
            let photoRaw = r.property_photo || r.photo; let photoStr = "";
            if (photoRaw) {
                let item = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
                if (typeof item === 'string') photoStr = item.trim();
                else if (item && typeof item === 'object') photoStr = item.name || (item.file ? item.file.url : (item.external ? item.external.url : ""));
            }
            const cleanName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const path = photoStr ? (photoStr.startsWith('http') ? photoStr : `images/recettes/${photoStr}`) : `images/recettes/${cleanName}.jpg`;

            return `
            <div id="picker-card-${id}" class="relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 bg-black shadow-xl transition-all duration-200">
                <img src="${path}" class="absolute inset-0 w-full h-full object-cover" onerror="this.onerror=null;this.src='images/recettes/default-recipe.jpg'">
                <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent"></div>
                <div class="absolute bottom-14 left-0 right-0 px-2.5 text-center">
                    <p class="text-[10px] font-bold text-white leading-tight line-clamp-2">${name}</p>
                    <p class="text-[8px] text-cyan-400/70 mt-0.5">${kcal} kcal / part</p>
                </div>
                <div class="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1">
                    <button onclick="adjustPortion('${id}', -0.5)" class="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white font-black text-lg active:scale-90 transition-transform leading-none">−</button>
                    <span id="portion-${id}" class="text-sm font-black text-cyan-400 min-w-[28px] text-center tabular-nums">0</span>
                    <button onclick="adjustPortion('${id}', 0.5)" class="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-black text-lg active:scale-90 transition-transform leading-none">+</button>
                </div>
            </div>`;
        }).join('')}</div>`;
        lucide.createIcons();
    }

    function adjustPortion(id, delta) {
        const current = recipePortions[id] || 0; const newVal = Math.max(0, Math.round((current + delta) * 10) / 10);
        recipePortions[id] = newVal;

        const display = document.getElementById(`portion-${id}`);
        if (display) display.textContent = newVal > 0 ? newVal : '0';

        const card = document.getElementById(`picker-card-${id}`);
        if (card) {
            card.style.outline = newVal > 0 ? '2px solid #22d3ee' : 'none'; card.style.outlineOffset = '2px';
            card.style.boxShadow = newVal > 0 ? '0 0 20px rgba(34,211,238,0.25)' : 'none';
        }

        const selected = Object.values(recipePortions).filter(v => v > 0).length;
        const floatWrap = document.getElementById('picker-float-btn');
        const floatLbl = document.getElementById('picker-float-label');
        if (floatWrap) {
            floatWrap.style.display = selected > 0 ? 'block' : 'none';
            if (floatLbl) {
                const totalKcal = Object.entries(recipePortions).filter(([, v]) => v > 0).reduce((sum, [rid, parts]) => {
                    const r = recipesCache.find(x => String(x.id) === rid); return sum + (r ? parseFloat(r.property_kcal_part || 0) * parts : 0);
                }, 0);
                floatLbl.textContent = `Enregistrer ${selected} repas · ${Math.round(totalKcal)} kcal`;
            }
        }
    }

    async function logSelectedRecipes() {
        const selected = Object.entries(recipePortions).filter(([, parts]) => parts > 0);
        if (selected.length === 0) { showNotification("Sélectionne au moins une recette.", "error"); return; }
        const userName = localStorage.getItem('fitbuddy_user_name') || "Utilisateur";
        const items = selected.map(([id, parts]) => {
            const r = recipesCache.find(x => String(x.id) === id) || {};
            return {
                recipeId: id, nom: r.property_nom || r.name || r.nom || "Recette", parts_consommees: parts,
                total_kcal: (parseFloat(r.property_kcal_part || 0) * parts).toFixed(1), total_prot: (parseFloat(r.property_p_part || 0) * parts).toFixed(1),
                total_glu: (parseFloat(r.property_g_part || 0) * parts).toFixed(1), total_lip: (parseFloat(r.property_l_part || 0) * parts).toFixed(1),
            };
        });

        const floatBtn = document.getElementById('picker-float-btn');
        const floatLbl = document.getElementById('picker-float-label');
        if (floatBtn) floatBtn.style.pointerEvents = 'none';
        if (floatLbl) floatLbl.textContent = 'Envoi en cours…';

        try {
            await fetch(`${N8N_URL}/webhook/log-macro-batch`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
                body: JSON.stringify({ email: userEmail, userName, items, timestamp: new Date().toISOString() })
            });
            closeRecipePicker();
            showNotification(`${items.length} repas enregistré(s) ✓`, "success");
            setTimeout(() => { triggerQuickAction('macros'); }, 300);

            const chat = document.getElementById('view-chat');
            if (chat) {
                const recap = items.map(i => `<b>${i.parts_consommees}× ${i.nom}</b>`).join(', ');
                chat.innerHTML += `<div class="msg-agent p-4 max-w-[90%] text-xs shadow-xl animate-in fade-in">🍽️ Macros enregistrées : ${recap}</div>`;
                chat.scrollTop = chat.scrollHeight;
            }
        } catch (error) {
            showNotification("Impossible d'enregistrer les macros.", "error");
            if (floatLbl) floatLbl.textContent = 'Réessayer';
        } finally {
            if (floatBtn) floatBtn.style.pointerEvents = 'auto';
        }
    }

    async function generateRecipeImage() {
        const recipeName = document.getElementById('recipe-name-input').value.trim();
        if (!recipeName) { showNotification("Donne d'abord un nom à ta recette pour inspirer l'IA !", "error"); return; }
        const ingredients = [];
        document.querySelectorAll('.ingredient-row .ingredient-name').forEach(input => { if (input.value.trim()) ingredients.push(input.value.trim()); });
        const loadingToast = showNotification(`Génération d'une image pour "${recipeName}"...`, "loading");

        try {
            const res = await fetch(`${N8N_URL}/webhook/generate-recipe-image`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
                body: JSON.stringify({ email: userEmail, recipeName: recipeName, ingredients: ingredients })
            });
            if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);

            const raw = await res.json();
            const data = Array.isArray(raw) ? raw[0] : raw;
            if (loadingToast) loadingToast.remove();

            if (data && (data.base64 || data.url)) {
                const img = document.getElementById('recipe-preview-img');
                const ext = data.extension || 'jpg';
                if (data.url && img) {
                    img.src = data.url; img.dataset.base64 = ""; img.dataset.extension = ext; img.dataset.remoteUrl = data.url;
                } else if (img) {
                    const cleanBase64 = data.base64.replace(/^data:image\/\w+;base64,/, "");
                    img.src = `data:image/${ext};base64,${cleanBase64}`; img.dataset.base64 = cleanBase64; img.dataset.extension = ext;
                }
                showNotification("Image générée avec succès ! ✨", "success");
            } else { showNotification("L'IA n'a pas retourné d'image.", "error"); }
        } catch (e) {
            if (loadingToast) loadingToast.remove();
            showNotification("Impossible de contacter le générateur IA.", "error");
        }
    }

    // ─── PRODUCT PICKER (courses) ────────────────────────────────────────────────

let allCoursesCache = [];   // tous les produits CoursesAllTime
let selectedProductForQty = null;  // produit en attente de quantité
let selectedUnit = "unité";

const SHOPPING_UNITS = [
    { label: "g",        value: "g" },
    { label: "kg",       value: "kg" },
    { label: "mL",       value: "mL" },
    { label: "L",        value: "L" },
    { label: "pièce",    value: "pièce(s)" },
    { label: "unité",    value: "unité" },
    { label: "bouteille",value: "bouteille" },
    { label: "boîte",    value: "boîte" },
    { label: "sachet",   value: "sachet" },
    { label: "paquet",   value: "paquet" },
    { label: "barquette",value: "barquette" },
    { label: "pot",      value: "pot" },
];

async function openProductPicker() {
    console.log("🟢 [openProductPicker] Ouverture de la modale...");
    document.getElementById('product-picker-modal').style.display = 'flex';
    const searchInput = document.getElementById('product-picker-search');
    if (searchInput) searchInput.value = '';

    if (allCoursesCache.length > 0) {
        console.log("AI Cache existant, affichage direct.");
        renderProductPicker(allCoursesCache);
        return;
    }

    const body = document.getElementById('product-picker-body');
    body.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-3 text-amber-400 py-16">
            <i data-lucide="loader" class="w-5 h-5 animate-spin"></i>
            <span class="text-[10px] tracking-widest uppercase">Chargement des produits…</span>
        </div>`;
    lucide.createIcons();

    try {
        const res = await fetch(`${N8N_URL}/webhook/all-courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
            body: JSON.stringify({ email: userEmail, userName: localStorage.getItem('fitbuddy_user_name') })
        });
        const data = await res.json();
        
        let extractedItems = [];
        if (Array.isArray(data)) {
            if (data.length > 0 && Array.isArray(data[0].items)) extractedItems = data[0].items;
            else if (data.length > 0 && Array.isArray(data[0].data)) extractedItems = data[0].data;
            else extractedItems = data; 
        } else if (data && typeof data === 'object') {
            if (data.items) extractedItems = data.items;
            else if (data.data) extractedItems = data.data;
            else if (data.id) extractedItems = [data];
        }
        
        // Mapping complet avec extraction robuste de la photo (style recette)
        allCoursesCache = extractedItems.map(p => {
            let photoRaw = p.property_photo || p.photo;
            let photoStr = "";
            if (photoRaw) {
                let item = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
                if (typeof item === 'string') photoStr = item.trim();
                else if (item && typeof item === 'object') {
                    photoStr = item.name || (item.file ? item.file.url : (item.external ? item.external.url : ""));
                }
            }

            return {
                id: p.id,
                nom: (p.property_nom || p.name || p.nom || "Produit").trim(),
                rayon: (p.property_rayon || p.rayon || "Autres").trim(),
                statut: (p.property_statut || p.statut || "out_basket").toLowerCase().trim(),
                quantite: p.property_quantite || p.quantite || 1,
                unite: p.property_unite || p.unite || "",
                photo: photoStr
            };
        });

        renderProductPicker(allCoursesCache);
        
    } catch (e) {
        console.error("🔴 Erreur all-courses :", e);
        body.innerHTML = `<div class="text-center text-red-400 text-xs py-12">⚠️ Impossible de charger les produits.</div>`;
    }
}

function closeProductPicker() {
    document.getElementById('product-picker-modal').style.display = 'none';
}

function filterProductPicker(query) {
    const filtered = query.trim().length < 1
        ? allCoursesCache
        : allCoursesCache.filter(p => {
            const nom = (p.nom || p.item || p.name || "").toLowerCase();
            return nom.includes(query.toLowerCase());
        });
    renderProductPicker(filtered);
}

function openNewProductModal(presetName = "") {
    selectedProductForQty = { isNew: true };
    selectedUnit = "unité";

    // Masque le titre standard et affiche le champ d'écriture
    document.getElementById('qty-modal-product-name').classList.add('hidden');
    const inputName = document.getElementById('qty-modal-product-name-input');
    inputName.classList.remove('hidden');
    
    // Si une recherche était active, on injecte la valeur recherchée automatiquement
    inputName.value = typeof presetName === 'string' ? presetName.trim() : "";

    document.getElementById('qty-modal-value').value = 1;

    const keyboard = document.getElementById('unit-keyboard');
    keyboard.innerHTML = SHOPPING_UNITS.map(u => `
        <button onclick="selectUnit('${u.value}', this)"
            class="unit-key py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all active:scale-90
            ${u.value === selectedUnit ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/10 text-white/50'}">
            ${u.label}
        </button>`).join('');

    document.getElementById('product-qty-modal').style.display = 'flex';
    lucide.createIcons();
    setTimeout(() => inputName.focus(), 80);
}
    
function renderProductPicker(items) {
    const body = document.getElementById('product-picker-body');
    if (!body) return;

    // Récupération de la valeur écrite dans la barre de recherche
    const searchInput = document.getElementById('product-picker-search');
    const query = searchInput ? searchInput.value.trim() : "";

    let html = "";

    // AJOUT DYNAMIQUE : Si l'utilisateur tape quelque chose, on lui affiche l'option de création en premier
    if (query.length > 0) {
        html += `
        <div class="mb-5">
            <div onclick="openNewProductModal('${query.replace(/'/g, "\\'")}')"
                class="flex items-center gap-3 p-3.5 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 transition-colors cursor-pointer active:scale-[0.98]">
                <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-none">
                    <i data-lucide="plus" class="w-5 h-5"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-black text-amber-400 leading-tight uppercase tracking-wide">Ajouter "${query}"</p>
                    <p class="text-[9px] text-white/40 uppercase tracking-widest">Créer un nouvel ingrédient personnalisé</p>
                </div>
                <i data-lucide="chevron-right" class="w-4 h-4 text-amber-400/40 flex-none"></i>
            </div>
        </div>`;
    }

    if (!items || items.length === 0) {
        // Si aucun résultat de la base n'est trouvé, on laisse l'option dynamique au-dessus et on met un petit message informatif en dessous
        body.innerHTML = html + `<p class="text-center text-white/20 text-xs py-8 italic">Aucun produit similaire répertorié</p>`;
        lucide.createIcons();
        return;
    }

    // Regroupement par rayon
    const grouped = {};
    items.forEach(p => {
        const rayon = (p.rayon || p.category || "Autres").trim();
        if (!grouped[rayon]) grouped[rayon] = [];
        grouped[rayon].push(p);
    });

    html += `<div class="space-y-6 pb-6">`;
    Object.entries(grouped).forEach(([rayon, prods]) => {
        html += `
        <div>
            <h3 class="text-[9px] font-black text-amber-400/50 uppercase tracking-widest mb-2 pl-1 border-l-2 border-amber-400/20">${rayon}</h3>
            <div class="space-y-1.5">`;
        prods.forEach(p => {
            const nom = (p.nom || p.item || p.name || "Produit").trim();
            const statut = (p.statut || p.status || "").toLowerCase();
            const isInBasket = statut === "in_basket";
            const cleanName = nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            
            let imgPath = p.photo 
                ? (p.photo.startsWith('http') || p.photo.startsWith('data:') ? p.photo : `images/produits/${p.photo}`) 
                : `images/produits/${cleanName}.jpg`;

            html += `
            <div onclick="openProductQtyModal(${JSON.stringify(p).replace(/"/g, '&quot;')})"
                class="flex items-center gap-3 p-3 rounded-2xl border transition-colors cursor-pointer active:scale-[0.98]
                ${isInBasket ? 'bg-amber-500/5 border-amber-500/20 opacity-60' : 'bg-white/[0.03] border-white/8 hover:bg-white/5'}">
                <div class="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-white/5 flex-none">
                    <img src="${imgPath}" class="w-full h-full object-cover" onerror="this.src='default-item.svg'">
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-white leading-tight truncate">${nom}</p>
                    <p class="text-[9px] text-white/30">${p.rayon || "Divers"}</p>
                </div>
                ${isInBasket
                    ? `<span class="flex-none text-[8px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg uppercase">Dans le panier</span>`
                    : `<i data-lucide="plus-circle" class="w-4 h-4 text-white/30 flex-none"></i>`}
            </div>`;
        });
        html += `</div></div>`;
    });
    html += `</div>`;

    body.innerHTML = html;
    lucide.createIcons();
}

function openProductQtyModal(product) {
    selectedProductForQty = product;
    
    // Remet la modale en configuration standard (produit existant)
    document.getElementById('qty-modal-product-name').classList.remove('hidden');
    document.getElementById('qty-modal-product-name-input').classList.add('hidden');

    // Récupère et sélectionne automatiquement l'unité enregistrée
    let savedUnit = product.unite ? product.unite.trim() : "";
    let matchedUnit = SHOPPING_UNITS.find(u => 
        u.value.toLowerCase() === savedUnit.toLowerCase() || 
        u.label.toLowerCase() === savedUnit.toLowerCase()
    );
    selectedUnit = matchedUnit ? matchedUnit.value : (savedUnit || "unité");

    const nom = (product.nom || product.item || product.name || "Produit").trim();
    document.getElementById('qty-modal-product-name').textContent = nom;
    
    // Récupère et sélectionne la quantité de référence enregistrée
    const defaultQty = parseFloat(product.quantite) || 1;
    document.getElementById('qty-modal-value').value = defaultQty;

    const keyboard = document.getElementById('unit-keyboard');
    keyboard.innerHTML = SHOPPING_UNITS.map(u => `
        <button onclick="selectUnit('${u.value}', this)"
            class="unit-key py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all active:scale-90
            ${u.value === selectedUnit ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/10 text-white/50'}">
            ${u.label}
        </button>`).join('');

    document.getElementById('product-qty-modal').style.display = 'flex';
    lucide.createIcons();
}

function closeProductQtyModal() {
    document.getElementById('product-qty-modal').style.display = 'none';
    selectedProductForQty = null;
}

function selectUnit(unit, btn) {
    selectedUnit = unit;
    document.querySelectorAll('.unit-key').forEach(b => {
        b.classList.remove('bg-amber-500/20', 'border-amber-500/50', 'text-amber-400');
        b.classList.add('bg-white/5', 'border-white/10', 'text-white/50');
    });
    btn.classList.add('bg-amber-500/20', 'border-amber-500/50', 'text-amber-400');
    btn.classList.remove('bg-white/5', 'border-white/10', 'text-white/50');
}

function adjustQtyModal(delta) {
    const input = document.getElementById('qty-modal-value');
    const current = parseFloat(input.value) || 0;
    const step = ['g', 'mL'].includes(selectedUnit) ? 50 : 1;
    input.value = Math.max(0, Math.round((current + delta * step) * 10) / 10);
}

async function confirmAddProduct() {
    if (!selectedProductForQty) return;

    let nom = "";
    if (selectedProductForQty.isNew) {
        nom = document.getElementById('qty-modal-product-name-input').value.trim();
        if (!nom) {
            showNotification("Veuillez donner un nom à l'ingrédient.", "error");
            return;
        }
    } else {
        nom = (selectedProductForQty.nom || selectedProductForQty.item || selectedProductForQty.name || "Produit").trim();
    }

    const quantite = parseFloat(document.getElementById('qty-modal-value').value) || 1;
    const unite = selectedUnit;
    const pageId = selectedProductForQty.isNew ? null : (selectedProductForQty.id || selectedProductForQty.pageId || selectedProductForQty.idNotion || null);

    const btn = document.querySelector('#product-qty-modal button[onclick="confirmAddProduct()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>'; lucide.createIcons(); }

    try {
        await fetch(`${N8N_URL}/webhook/shopping-add-product`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
            body: JSON.stringify({
                email: userEmail,
                userName: localStorage.getItem('fitbuddy_user_name') || "Utilisateur",
                pageId, // Sera null si c'est un nouveau produit pour laisser n'importe quel script l'insérer
                produit: nom,
                quantite,
                unite,
                action: "add_to_basket"
            })
        });

        closeProductQtyModal();
        closeProductPicker();
        showNotification(`🛒 ${quantite} ${unite} de "${nom}" ajouté !`, "success");
        setTimeout(() => triggerQuickAction('courses'), 400);

    } catch (e) {
        showNotification("Impossible d'ajouter le produit.", "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="plus" class="w-3.5 h-3.5"></i> Ajouter';
            lucide.createIcons();
        }
    }
}
    // --- GESTION DES OBJECTIFS MACROS ---
// --- GESTION DES OBJECTIFS MACROS ---

function openMacroGoalsModal() {
    document.getElementById('macro-goals-modal').style.display = 'flex';
    document.getElementById('macro-goals-form').classList.remove('hidden');
    document.getElementById('macro-goals-results').classList.add('hidden');
    
    // Pre-populate from cached user profile
    const cachedProfileStr = localStorage.getItem('fitbuddy_user_profile');
    if (cachedProfileStr) {
        try {
            const profile = JSON.parse(cachedProfileStr);
            const sportGoal = profile.objectif_sportif || "Maintien";
            
            // Map long database sport goal strings to short option values in macro modal select
            let selectVal = "Maintien";
            if (sportGoal.includes("Hypertrophie")) selectVal = "Hypertrophie";
            else if (sportGoal.includes("Bulk")) selectVal = "Bulk";
            else if (sportGoal.includes("Cut")) selectVal = "Cut";
            else if (sportGoal.includes("Maintien")) selectVal = "Maintien";
            else if (sportGoal.includes("Recomp")) selectVal = "Recomp";
            else if (sportGoal.includes("Force")) selectVal = "Force";
            else if (sportGoal.includes("Endurance")) selectVal = "Endurance";
            
            const objSelect = document.getElementById('mg-objectif');
            if (objSelect) {
                objSelect.value = selectVal;
            }
        } catch (e) {
            console.error("Erreur lors du pré-remplissage des objectifs macros :", e);
        }
    }
    
    toggleMacroSlider(); // Initialise l'état du curseur
    if (window.lucide) lucide.createIcons();
}

function closeMacroGoalsModal() {
    document.getElementById('macro-goals-modal').style.display = 'none';
}

function toggleMacroSlider() {
    const obj = document.getElementById('mg-objectif').value;
    const container = document.getElementById('mg-slider-container');
    // On affiche le curseur uniquement pour les objectifs nécessitant un ajustement explicite
    if (['Hypertrophie', 'Bulk', 'Cut', 'Recomp'].includes(obj)) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
        document.getElementById('mg-surplus-deficit').value = 0;
        updateMacroSliderLabel(0);
    }
}

function updateMacroSliderLabel(val) {
    const prefix = val > 0 ? '+' : '';
    document.getElementById('mg-slider-val').innerText = `${prefix}${val}%`;
}

async function generateMacroGoals() {
    // Profil de base
    const taille = document.getElementById('mg-taille').value;
    const poids = document.getElementById('mg-poids').value;
    const age = document.getElementById('mg-age').value;
    const bf = document.getElementById('mg-bf').value;
    const objectif = document.getElementById('mg-objectif').value;
    const promptText = document.getElementById('mg-prompt').value;
    
    // Nouveaux paramètres sportifs
    const muscuSeances = document.getElementById('mg-muscu-seances').value || 0;
    const muscuDuree = document.getElementById('mg-muscu-duree').value || 0;
    const cardioSeances = document.getElementById('mg-cardio-seances').value || 0;
    const cardioDuree = document.getElementById('mg-cardio-duree').value || 0;
    const pas = document.getElementById('mg-pas').value || 0;
    
    // Curseur (Surplus / Déficit)
    const surplusDeficit = document.getElementById('mg-surplus-deficit').value || 0;
    
    if(!poids || !taille || !age) {
        showNotification("Remplis au moins le poids, la taille et l'âge !", "error");
        return;
    }

    const btn = document.getElementById('btn-generate-macros');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin text-purple-400"></i> Évaluation...';
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch(`${N8N_URL}/webhook/calculate-macros-ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: userEmail,
                userName: localStorage.getItem('fitbuddy_user_name'),
                taille, poids, age, bf, objectif, prompt: promptText,
                activite: {
                    muscu: { seances: muscuSeances, duree: muscuDuree },
                    cardio: { seances: cardioSeances, duree: cardioDuree },
                    pas: pas
                },
                ajustement_pourcentage: surplusDeficit
            })
        });

        if (!res.ok) throw new Error("Erreur serveur");
        
     const data = await res.json();
        const r = Array.isArray(data) ? data[0] : data;
        
        // --- DEBUG : Ouvre la console F12 pour voir cette ligne ---
        console.log("DEBUG - Réponse brute de n8n :", r);

        // On cherche le contenu de "output", sinon on prend le reste
        let target = r.output || r;

        // Si target est une string, on la transforme en objet
        if (typeof target === 'string') {
            try { target = JSON.parse(target); } catch(e) { console.error("Erreur parsing JSON"); }
        }

        // On vérifie si on a bien les clés (kcal, prot, glu, lip)
        if(target && target.kcal !== undefined) {
            document.getElementById('mg-res-kcal').value = target.kcal;
            document.getElementById('mg-res-prot').value = target.prot;
            document.getElementById('mg-res-glu').value = target.glu;
            document.getElementById('mg-res-lip').value = target.lip;
            
            
            document.getElementById('macro-goals-form').classList.add('hidden');
            document.getElementById('macro-goals-results').classList.remove('hidden');
            showNotification("Tyler a calculé tes macros !", "success");
        } else {
            console.error("Format inattendu :", target);
            showNotification("Erreur : Format de données invalide.", "error");
        }
    } catch (e) {
        console.error(e);
        showNotification("Impossible de contacter Tyler.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        if (window.lucide) lucide.createIcons();
    }
}

async function saveMacroGoals() {
    const kcal = parseFloat(document.getElementById('mg-res-kcal').value);
const prot = parseFloat(document.getElementById('mg-res-prot').value);
const glu = parseFloat(document.getElementById('mg-res-glu').value);
const lip = parseFloat(document.getElementById('mg-res-lip').value);
    const objectif = document.getElementById('mg-objectif').value;

    const btn = document.getElementById('btn-save-macros');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Valider...';
    if (window.lucide) lucide.createIcons();

    try {
        const res = await fetch(`${N8N_URL}/webhook/save-macro-goals`, {
            method: 'POST',
headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },

            body: JSON.stringify({ 
                email: userEmail,
                userName: localStorage.getItem('fitbuddy_user_name'),
                 objectif: objectif,
                macros: { kcal, prot, glu, lip }
            })
        });

        if (!res.ok) throw new Error("Erreur serveur");
        
        closeMacroGoalsModal();
        showNotification("Nouveaux objectifs sauvegardés !", "success");
        triggerQuickAction('macros');

    } catch (e) {
        console.error(e);
        showNotification("Erreur lors de la sauvegarde.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        if (window.lucide) lucide.createIcons();
    }
}

/* ──────────────────────────────────────────────────────────────────────────
   MODUL FONCTIONNALITÉ "RAPPORT" FITBUDDY
   ────────────────────────────────────────────────────────────────────────── */

async function switchToRapport(data) {
    moveToHeader("agent-eat.mp4");
    showView('view-rapport');
    const container = document.getElementById('view-rapport');
    if (!container) return;
    document.getElementById('floating-plus').classList.add('hidden');

    // Merging profile from n8n fetch and local storage for maximum resilience and freshness
    let cachedProfile = null;
    try {
        cachedProfile = JSON.parse(localStorage.getItem('fitbuddy_user_profile'));
    } catch(e) {}
    const profile = { ...cachedProfile, ...(data.profile || {}) };
    
    // Save the combined profile back to local storage
    if (data.profile) {
        localStorage.setItem('fitbuddy_user_profile', JSON.stringify(profile));
        updateGroupData(profile);
    }

    const nickname = profile.surnom || profile.nom || "Athlète";

    // 1. Normalize and parse weightHistory from data.historique (Notion mensurations database)
    let weightHistory = [];
    if (data.historique && Array.isArray(data.historique) && data.historique.length > 0) {
        weightHistory = data.historique.map(item => {
            const normalized = {};
            
            // Normalize Date
            let rawDate = item.date || item.Date || item.created_time || "";
            if (rawDate && typeof rawDate === 'object') {
                rawDate = rawDate.start || rawDate.date?.start || "";
            }
            if (rawDate && typeof rawDate === 'string') {
                normalized.date = rawDate.substring(0, 10);
            } else {
                normalized.date = new Date().toISOString().substring(0, 10);
            }
            
            // Normalize all known metrics
            const metricKeys = [
                "poids", "masse_grasse", "tour_de_taille", "tour_de_hanche", 
                "tour_cuisse_droite", "tour_cuisse_gauche", "masse_musculaire", 
                "graisse_viscerale", "tour_de_cou", "tour_epaules", 
                "tour_de_poitrine", "tour_bras_droit", "tour_bras_gauche", 
                "tour_mollet_droit", "tour_mollet_gauche"
            ];
            
            metricKeys.forEach(key => {
                let val = item[key];
                if (val === undefined || val === null) {
                    // Try alternative naming keys
                    const alternativeNames = [
                        key,
                        key.toLowerCase(),
                        key.toUpperCase(),
                        key.replace(/_/g, ' '),
                        key.replace(/_/g, '-'),
                    ];
                    for (const alt of alternativeNames) {
                        if (item[alt] !== undefined && item[alt] !== null) {
                            val = item[alt];
                            break;
                        }
                    }
                }
                
                if (val && typeof val === 'object') {
                    val = val.number !== undefined ? val.number : (val.rich_text || val.title || val.select?.name || null);
                }
                
                if (val !== undefined && val !== null) {
                    const parsedVal = parseFloat(val);
                    if (!isNaN(parsedVal)) {
                        normalized[key] = parsedVal;
                    }
                }
            });
            
            return normalized;
        });
        
        // Sort chronologically by date
        weightHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Save the real history to local storage so the graphs display the real data
        localStorage.setItem('fitbuddy_weight_history', JSON.stringify(weightHistory));
    } else {
        try {
            weightHistory = JSON.parse(localStorage.getItem('fitbuddy_weight_history')) || [];
        } catch(e) {}
    }

    const bodyMetric = profile.type_objectif_corporel || "poids";
    
    // Determine active goal parameters (representing active bodyMetric)
    const targetVal = parseFloat(profile.objectif_corporel_but || 85.0);
    const initialVal = parseFloat(profile.objectif_corporel_initial || 110.0);
    
    const latestHistoryEntry = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1] : null;

    // Resolve current weight and current fat from the latest recorded history or profile
    const currentWeight = parseFloat(
        latestHistoryEntry?.poids || 
        (bodyMetric === "poids" ? profile.objectif_corporel_actuel : null) || 
        profile.mensurations?.poids || 
        103.6
    );
    const targetWeight = parseFloat(profile.objectif_corporel_but || 85.0);
    const initialWeight = parseFloat(profile.objectif_corporel_initial || 110.0);
    const currentFat = parseFloat(
        latestHistoryEntry?.masse_grasse || 
        (bodyMetric === "masse_grasse" ? profile.objectif_corporel_actuel : null) || 
        profile.mensurations?.masse_grasse || 
        22.0
    );
    const currentMuscle = parseFloat(
        latestHistoryEntry?.masse_musculaire || 
        (bodyMetric === "masse_musculaire" ? profile.objectif_corporel_actuel : null) || 
        profile.mensurations?.masse_musculaire || 
        45.0
    );

    // Active metric current value for the mountain progression
    let currentVal = parseFloat(profile.objectif_corporel_actuel);
    if (isNaN(currentVal) || currentVal === 0) {
        currentVal = parseFloat(latestHistoryEntry?.[bodyMetric] || profile.mensurations?.[bodyMetric] || currentWeight);
    }

    // Generate fallback history if still absolutely empty
    if (weightHistory.length === 0) {
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i * 3);
            const factor = i / 6;
            const w = parseFloat((targetWeight + (initialWeight - targetWeight) * (0.2 + factor * 0.7) + (Math.random() - 0.5)).toFixed(1));
            weightHistory.push({
                date: d.toISOString().substring(0, 10),
                poids: w,
                masse_grasse: parseFloat((currentFat + (Math.random() - 0.5) * 1.5).toFixed(1))
            });
        }
        localStorage.setItem('fitbuddy_weight_history', JSON.stringify(weightHistory));
    }

    const goalKcal = parseFloat(data.veille?.goal_kcal || profile.objectif_calorique || 2000);
    const goalProt = parseFloat(data.veille?.goal_prot || profile.objectif_proteines || 150);
    const goalGlu = parseFloat(data.veille?.goal_glu || profile.objectif_glucides || 200);
    const goalLip = parseFloat(data.veille?.goal_lip || profile.objectif_lipides || 70);

    // Partie 1 : Bilan macro de la veille
    let actualKcal = 0, actualProt = 0, actualGlu = 0, actualLip = 0;
    if (data.veille) {
        actualKcal = parseFloat(data.veille.calories_consommees) || 0;
        actualProt = parseFloat(data.veille.proteines_consommees) || 0;
        actualGlu = parseFloat(data.veille.glucides_consommes) || 0;
        actualLip = parseFloat(data.veille.lipides_consommes) || 0;
    } else if (data.macros && data.macros.calories) {
        actualKcal = parseFloat(data.macros.calories.current) || 0;
        actualProt = parseFloat(data.macros.proteins.current) || 0;
        actualGlu = parseFloat(data.macros.carbs.current) || 0;
        actualLip = parseFloat(data.macros.lipids.current) || 0;
    }
    
    // Fallback dynamique si pas de macros enregistrées aujourd'hui/hier
    if (actualKcal === 0) {
        actualKcal = Math.round(goalKcal * 0.98);
        actualProt = Math.round(goalProt * 0.96);
        actualGlu = Math.round(goalGlu * 1.05);
        actualLip = Math.round(goalLip * 0.97);
    }

    const pKcal = Math.min(100, Math.round((actualKcal / goalKcal) * 100));
    const pProt = Math.min(100, Math.round((actualProt / goalProt) * 100));
    const pGlu = Math.min(100, Math.round((actualGlu / goalGlu) * 100));
    const pLip = Math.min(100, Math.round((actualLip / goalLip) * 100));

    // Détermination des alertes
    const getStatusBadge = (pct) => {
        if (pct >= 90 && pct <= 105) return `<span class="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase">Atteint</span>`;
        if (pct > 105) return `<span class="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-[8px] font-black uppercase">Dépassement</span>`;
        return `<span class="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[8px] font-black uppercase">Sous-atteint</span>`;
    };
    
    // Détermination de l'unité et du libellé selon la métrique active de l'objectif
    let metricUnit = "kg";
    let metricLabel = "Mesures";
    if (bodyMetric === "poids" || bodyMetric === "masse_musculaire") {
        metricUnit = "kg";
        metricLabel = "Pesées";
    } else if (bodyMetric === "masse_grasse") {
        metricUnit = "%";
        metricLabel = "Masse Grasse";
    } else if (bodyMetric === "graisse_viscerale") {
        metricUnit = "idx";
        metricLabel = "Graisse Viscérale";
    } else {
        metricUnit = "cm";
        metricLabel = "Mensurations";
    }

    // Calcul de la moyenne des 7 dernières mesures pour la métrique active
    const last7Weights = weightHistory.slice(-7);
    const getMetricVal = (item) => {
        let val = item[bodyMetric];
        if (val === undefined || val === null) {
            const refVal = parseFloat(profile.mensurations?.[bodyMetric] || (bodyMetric === "masse_grasse" ? 22 : 60));
            val = refVal;
        }
        return parseFloat(val);
    };

    const avgWeight = parseFloat((last7Weights.reduce((acc, curr) => acc + getMetricVal(curr), 0) / last7Weights.length).toFixed(1));
    const previousAvg = last7Weights.length > 1 
        ? parseFloat((last7Weights.slice(0, -1).reduce((acc, curr) => acc + getMetricVal(curr), 0) / (last7Weights.length - 1)).toFixed(1))
        : avgWeight;

    const isLosingGoal = targetVal < initialVal;
    const progressTrendTowardsGoal = isLosingGoal 
        ? (avgWeight <= previousAvg) 
        : (avgWeight >= previousAvg);

    // Dessin de la montagne SVG avec les paramètres de l'objectif actif
    const mountainSvgHtml = drawMountainProgression(initialVal, targetVal, currentVal);
    // Recalculateur intelligent client-side pour le Volet 2
    const prevEntry = weightHistory.length > 1 ? weightHistory[weightHistory.length - 2] : null;
    const prevWeight = parseFloat(prevEntry?.poids || currentWeight);
    const prevFat = parseFloat(prevEntry?.masse_grasse || currentFat);
    const prevMuscle = parseFloat(prevEntry?.masse_musculaire || currentMuscle);

    const getMacrosForWeight = (w) => {
        const taille = parseFloat(profile.taille || 180);
        const age = parseFloat(profile.age || 30);
        const activityCoeff = 1.375; // Active
        
        const BMR = 10 * w + 6.25 * taille - 5 * age + 5;
        const TDEE = Math.round(BMR * activityCoeff);
        
        const goal = profile.objectif_sportif || "Maintien";
        let kcal = TDEE;
        
        if (goal.includes("Cut") || goal.includes("sèche")) kcal -= 500;
        else if (goal.includes("Bulk") || goal.includes("masse")) kcal += 350;
        else if (goal.includes("Hypertrophie")) kcal += 200;
        else if (goal.includes("Recomp")) kcal -= 200;

        const prot = Math.round(w * 2.2);
        const lip = Math.round(w * 0.9);
        const gluc = Math.round((kcal - (prot * 4 + lip * 9)) / 4);
        
        return { kcal, prot, gluc, lip };
    };

    const newMacros = getMacrosForWeight(currentWeight);
    const oldMacros = getMacrosForWeight(prevWeight);

    const diffKcal = newMacros.kcal - oldMacros.kcal;
    const diffProt = newMacros.prot - oldMacros.prot;
    const diffGluc = newMacros.gluc - oldMacros.gluc;
    const diffLip = newMacros.lip - oldMacros.lip;

    const formatDiff = (diff, unit = "") => {
        if (diff > 0) return `<span class="text-emerald-400 font-extrabold">+${diff}${unit} ⬆️</span>`;
        if (diff < 0) return `<span class="text-orange-400 font-extrabold">${diff}${unit} ⬇️</span>`;
        return `<span class="text-white/40 font-extrabold">0${unit} ➡️</span>`;
    };

    const diffKcalHtml = formatDiff(diffKcal, " kcal");
    const diffProtHtml = formatDiff(diffProt, "g");
    const diffGlucHtml = formatDiff(diffGluc, "g");
    const diffLipHtml = formatDiff(diffLip, "g");

    const diffWeight = currentWeight - prevWeight;
    const diffFat = currentFat - prevFat;
    const diffMuscle = currentMuscle - prevMuscle;

    const diffWeightHtml = diffWeight > 0 
        ? `<span class="text-[9px] font-bold text-emerald-400 block mt-0.5">+${diffWeight.toFixed(1)} kg ⬆️</span>`
        : diffWeight < 0 
            ? `<span class="text-[9px] font-bold text-orange-400 block mt-0.5">${diffWeight.toFixed(1)} kg ⬇️</span>`
            : `<span class="text-[9px] font-bold text-white/30 block mt-0.5">Stable ➡️</span>`;

    const diffFatHtml = diffFat > 0 
        ? `<span class="text-[9px] font-bold text-emerald-400 block mt-0.5">+${diffFat.toFixed(1)}% ⬆️</span>`
        : diffFat < 0 
            ? `<span class="text-[9px] font-bold text-orange-400 block mt-0.5">${diffFat.toFixed(1)}% ⬇️</span>`
            : `<span class="text-[9px] font-bold text-white/30 block mt-0.5">Stable ➡️</span>`;

    const diffMuscleHtml = diffMuscle > 0 
        ? `<span class="text-[9px] font-bold text-emerald-400 block mt-0.5">+${diffMuscle.toFixed(1)} kg ⬆️</span>`
        : diffMuscle < 0 
            ? `<span class="text-[9px] font-bold text-orange-400 block mt-0.5">${diffMuscle.toFixed(1)} kg ⬇️</span>`
            : `<span class="text-[9px] font-bold text-white/30 block mt-0.5">Stable ➡️</span>`;

    let trendHtml = "";
    if (diffWeight > 0) {
        trendHtml = `<span class="trend-badge bg-emerald-500/10 text-emerald-400 font-extrabold uppercase gap-1 flex items-center text-[8px] py-0.5 px-2 rounded-md border border-emerald-500/30">Hausse <i data-lucide="trending-up" class="w-3 h-3"></i></span>`;
    } else if (diffWeight < 0) {
        trendHtml = `<span class="trend-badge bg-orange-500/10 text-orange-400 font-extrabold uppercase gap-1 flex items-center text-[8px] py-0.5 px-2 rounded-md border border-orange-500/30">Baisse <i data-lucide="trending-down" class="w-3 h-3"></i></span>`;
    } else {
        trendHtml = `<span class="trend-badge bg-gray-500/10 text-gray-400 font-extrabold uppercase gap-1 flex items-center text-[8px] py-0.5 px-2 rounded-md border border-gray-500/30">Stable <i data-lucide="minus" class="w-3 h-3"></i></span>`;
    }

    let tylerExplanation = localStorage.getItem('fitbuddy_tyler_metabolic_note') || "";
    if (!tylerExplanation) {
        if (diffWeight < 0) {
            tylerExplanation = `Super boulot, ${nickname} ! Ta pesée est en baisse de **${Math.abs(diffWeight).toFixed(1)} kg**. Ton métabolisme s'ajuste pour consommer un peu moins d'énergie au repos. Tyler a donc recalibré tes apports pour maintenir ton déficit calorique de manière chirurgicale, tout en maintenant ton quota de protéines de sécurité à 2.2g par kg de poids de corps.`;
        } else if (diffWeight > 0) {
            tylerExplanation = `Ton poids est en hausse de **${diffWeight.toFixed(1)} kg**. Pas de panique, cela peut être dû à une rétention d'eau, du glycogène ou de la croissance musculaire. Tyler a légèrement augmenté tes apports pour soutenir ton métabolisme et tes entraînements. Continue de pousser fort !`;
        } else {
            tylerExplanation = `Ton poids est parfaitement stable à **${currentWeight} kg**. Ton métabolisme tourne à plein régime et est en équilibre. Tes macros de maintenance ou de déficit sont parfaitement calées pour cette semaine.`;
        }
    }


    let html = `
    <div class="p-2 space-y-6 pb-24 animate-in fade-in duration-500 overflow-y-auto no-scrollbar h-full">
        <!-- Header -->
        <div class="category-badge mb-2 !bg-fuchsia-500/10 border-fuchsia-500/20">
            <i data-lucide="trending-up" class="w-3.5 h-3.5 text-fuchsia-400"></i>
            <h2 class="text-[10px] font-black text-white uppercase tracking-[0.15em]">Mon Rapport Matinal</h2>
        </div>

        <!-- VOLET 1 : Bilan macro de la veille -->
        <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-5 shadow-xl">
            <div class="flex items-center gap-2 border-b border-white/10 pb-3">
                <i data-lucide="clipboard-list" class="w-4 h-4 text-fuchsia-400"></i>
                <h4 class="text-xs font-black text-white uppercase tracking-wider">1. Bilan macro de la veille</h4>
            </div>

            <div class="space-y-3">
                <div class="space-y-1">
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-white/60">Calories (${actualKcal} / ${goalKcal} kcal)</span>
                        <div class="flex items-center gap-1.5">${getStatusBadge(pKcal)}</div>
                    </div>
                    <div class="progress-track"><div class="progress-fill !bg-gradient-to-r !from-orange-500 !to-amber-500" style="width: ${pKcal}%"></div></div>
                </div>

                <div class="space-y-1">
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-white/60">Protéines (${actualProt} / ${goalProt}g)</span>
                        <div class="flex items-center gap-1.5">${getStatusBadge(pProt)}</div>
                    </div>
                    <div class="progress-track"><div class="progress-fill !bg-gradient-to-r !from-blue-500 !to-cyan-500" style="width: ${pProt}%"></div></div>
                </div>

                <div class="space-y-1">
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-white/60">Glucides (${actualGlu} / ${goalGlu}g)</span>
                        <div class="flex items-center gap-1.5">${getStatusBadge(pGlu)}</div>
                    </div>
                    <div class="progress-track"><div class="progress-fill !bg-gradient-to-r !from-green-500 !to-emerald-500" style="width: ${pGlu}%"></div></div>
                </div>

                <div class="space-y-1">
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-white/60">Lipides (${actualLip} / ${goalLip}g)</span>
                        <div class="flex items-center gap-1.5">${getStatusBadge(pLip)}</div>
                    </div>
                    <div class="progress-track"><div class="progress-fill !bg-gradient-to-r !from-red-500 !to-rose-500" style="width: ${pLip}%"></div></div>
                </div>
            </div>

            <!-- Tyler AI Assessment -->
            <div class="bg-fuchsia-950/10 border border-fuchsia-500/20 rounded-2xl p-4 space-y-2 relative overflow-hidden">
                <div class="flex items-center gap-2">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5 text-fuchsia-400 animate-pulse"></i>
                    <h5 class="text-[9px] font-black text-fuchsia-400 uppercase tracking-widest">Analyse de Tyler</h5>
                </div>
                <p class="text-[11px] text-white/80 leading-relaxed font-medium">
                    "${data.veille?.analyse_tyler || data.veille?.analyse || `Salut ${nickname} ! J'ai passé au crible ton bilan de la veille. Ton apport en protéines est solide à ${actualProt}g. Le contrôle calorique est très bon (${pKcal}% d'atteinte). Attention à ton léger pic de glucides, mais ton niveau d'activité physique compense parfaitement cette tendance. Maintiens le cap ce matin !`}"
                </p>
            </div>
        </div>

        <!-- VOLET 2 : Ajustement automatique des macros -->
        <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-5 shadow-xl relative">
            <div class="flex justify-between items-center border-b border-white/10 pb-3">
                <div class="flex items-center gap-2">
                    <i data-lucide="scale" class="w-4 h-4 text-fuchsia-400"></i>
                    <h4 class="text-xs font-black text-white uppercase tracking-wider">2. Ajustement des macros</h4>
                </div>
                <div class="flex items-center gap-1.5">
                    ${trendHtml}
                </div>
            </div>

            <!-- Dernière Pesée Enregistrée -->
            <div class="grid grid-cols-3 gap-2 bg-white/[0.02] p-3 rounded-2xl border border-white/5">
                <div class="text-center p-2">
                    <span class="text-[8px] font-bold text-white/40 uppercase block mb-0.5">Poids</span>
                    <p class="text-sm font-black text-white">${currentWeight} kg</p>
                    ${diffWeightHtml}
                </div>
                <div class="text-center p-2 border-l border-white/5">
                    <span class="text-[8px] font-bold text-white/40 uppercase block mb-0.5">Masse Grasse</span>
                    <p class="text-sm font-black text-white">${currentFat}%</p>
                    ${diffFatHtml}
                </div>
                <div class="text-center p-2 border-l border-white/5">
                    <span class="text-[8px] font-bold text-white/40 uppercase block mb-0.5">Masse Muscle</span>
                    <p class="text-sm font-black text-white">${currentMuscle} kg</p>
                    ${diffMuscleHtml}
                </div>
            </div>

            <!-- Grille Comparative des Macros -->
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <h5 class="text-[9px] font-black text-fuchsia-400 uppercase tracking-widest">Recalcul de Tyler</h5>
                    <span class="text-[8px] font-bold text-cyan-400 uppercase">Basé sur Mifflin-St Jeor</span>
                </div>
                
                <div class="overflow-x-auto rounded-2xl border border-white/5 bg-black/30">
                    <table class="w-full text-left border-collapse text-[10px]">
                        <thead>
                            <tr class="border-b border-white/5 bg-white/[0.02]">
                                <th class="p-3 text-[8px] font-bold text-white/40 uppercase">Macro</th>
                                <th class="p-3 text-[8px] font-bold text-white/40 uppercase text-center">Avant</th>
                                <th class="p-3 text-[8px] font-bold text-white/40 uppercase text-center">Après</th>
                                <th class="p-3 text-[8px] font-bold text-white/40 uppercase text-right">Variation</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5 text-white/80 font-medium">
                            <tr>
                                <td class="p-3 font-bold text-orange-400">Calories</td>
                                <td class="p-3 text-center text-white/60">${oldMacros.kcal} kcal</td>
                                <td class="p-3 text-center font-black text-white">${newMacros.kcal} kcal</td>
                                <td class="p-3 text-right font-black">${diffKcalHtml}</td>
                            </tr>
                            <tr>
                                <td class="p-3 font-bold text-blue-400">Protéines</td>
                                <td class="p-3 text-center text-white/60">${oldMacros.prot}g</td>
                                <td class="p-3 text-center font-black text-white">${newMacros.prot}g</td>
                                <td class="p-3 text-right font-black">${diffProtHtml}</td>
                            </tr>
                            <tr>
                                <td class="p-3 font-bold text-green-400">Glucides</td>
                                <td class="p-3 text-center text-white/60">${oldMacros.gluc}g</td>
                                <td class="p-3 text-center font-black text-white">${newMacros.gluc}g</td>
                                <td class="p-3 text-right font-black">${diffGlucHtml}</td>
                            </tr>
                            <tr>
                                <td class="p-3 font-bold text-red-400">Lipides</td>
                                <td class="p-3 text-center text-white/60">${oldMacros.lip}g</td>
                                <td class="p-3 text-center font-black text-white">${newMacros.lip}g</td>
                                <td class="p-3 text-right font-black">${diffLipHtml}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Message d'accompagnement de l'agent -->
            <div class="bg-fuchsia-950/10 border border-fuchsia-500/10 rounded-2xl p-4 space-y-1.5">
                <div class="flex items-center gap-2">
                    <i data-lucide="info" class="w-3.5 h-3.5 text-fuchsia-400"></i>
                    <span class="text-[8px] font-black text-fuchsia-400 uppercase tracking-widest">Note métabolique de Tyler</span>
                </div>
                <p class="text-[10px] text-white/60 leading-relaxed font-medium">
                    ${tylerExplanation}
                </p>
            </div>
        </div>

        <!-- VOLET 3 : Progression vers l'objectif corporel -->
        <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-5 shadow-xl">
            <div class="flex justify-between items-center border-b border-white/10 pb-3">
                <div class="flex items-center gap-2">
                    <i data-lucide="mountain" class="w-4 h-4 text-fuchsia-400"></i>
                    <h4 class="text-xs font-black text-white uppercase tracking-wider">3. Progression vers l'objectif</h4>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[8px] font-black text-white/30 uppercase">${metricLabel} (Moyenne mobile des 7 dernières)</span>
                    <span class="trend-badge ${progressTrendTowardsGoal ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}">
                        ${avgWeight} ${metricUnit}
                        <i data-lucide="${progressTrendTowardsGoal ? 'arrow-down-right' : 'arrow-up-right'}" class="w-3 h-3"></i>
                    </span>
                </div>
            </div>

            <!-- The Mountain path vector -->
            <div class="mountain-container">
                ${mountainSvgHtml}
            </div>

            <div class="grid grid-cols-3 gap-2 text-center pt-2">
                <div class="space-y-1">
                    <span class="text-[8px] font-bold text-white/30 uppercase">Départ</span>
                    <p class="text-xs font-black text-white">${initialVal} ${metricUnit}</p>
                </div>
                <div class="space-y-1 border-x border-white/5">
                    <span class="text-[8px] font-bold text-cyan-400 uppercase">Actuel</span>
                    <p class="text-xs font-black text-cyan-400">${currentVal} ${metricUnit}</p>
                </div>
                <div class="space-y-1">
                    <span class="text-[8px] font-bold text-purple-400 uppercase">Cible</span>
                    <p class="text-xs font-black text-purple-400">${targetVal} ${metricUnit}</p>
                </div>
            </div>
        </div>
    </div>`;

    container.innerHTML = html;
    lucide.createIcons();
    setTimeout(() => { container.scrollTo({ top: 0, behavior: 'instant' }); }, 100);
}

function drawMountainProgression(initial, target, current) {
    let progress = 0;
    if (initial !== target) {
        const totalDistance = Math.abs(target - initial);
        const currentDistance = Math.abs(current - initial);
        progress = Math.min(100, Math.max(0, Math.round((currentDistance / totalDistance) * 100)));
    } else {
        progress = current === target ? 100 : 0;
    }

    // SVG Mountain path calculations
    // Curved trail coordinate points interpolator
    const pathX = (percent) => 25 + (275 - 25) * (percent / 100);
    const pathY = (percent) => {
        // Non-linear mountain slope curve equation
        const x = percent / 100;
        return 170 - 130 * Math.pow(x, 1.3);
    };

    const cx = parseFloat(pathX(progress).toFixed(1));
    const cy = parseFloat(pathY(progress).toFixed(1));

    // Generates curvilinear paths in SVG format
    let points = [];
    for (let p = 0; p <= 100; p += 2) {
        points.push(`${pathX(p).toFixed(1)},${pathY(p).toFixed(1)}`);
    }
    const dPath = "M " + points.join(" L ");

    // The physical foreground mountain shape is exactly the filled region under the trail ridge curve
    const mountainPathD = `M 25,190 L ${points.join(" L ")} L 275,190 Z`;

    // Secondary background mountain curve for dynamic layered depth (parallax effect)
    let bgPoints = [];
    for (let p = 0; p <= 100; p += 2) {
        const bgX = 60 + (285 - 60) * (p / 100);
        const bgY = 180 - 100 * Math.pow(p / 100, 1.2);
        bgPoints.push(`${bgX.toFixed(1)},${bgY.toFixed(1)}`);
    }
    const bgMountainD = `M 60,190 L ${bgPoints.join(" L ")} L 285,190 Z`;

    // Active progress trail line up to climber's current position
    let progressPoints = [];
    for (let p = 0; p <= progress; p += 2) {
        progressPoints.push(`${pathX(p).toFixed(1)},${pathY(p).toFixed(1)}`);
    }
    if (progress > 0 && progress % 2 !== 0) {
        progressPoints.push(`${cx},${cy}`);
    }
    const dProgressPath = progressPoints.length > 0 ? "M " + progressPoints.join(" L ") : "";

    return `
    <svg class="mountain-svg" viewBox="0 0 300 200">
        <defs>
            <linearGradient id="mountain-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#1e1b4b" stop-opacity="0.85"/>
                <stop offset="100%" stop-color="#4c1d95" stop-opacity="0.4"/>
            </linearGradient>
        </defs>
        <!-- 1. Background secondary mountain peak for depth -->
        <path d="${bgMountainD}" fill="#1e1b4b" opacity="0.45" />

        <!-- 2. Foreground main mountain body exactly contoured under the curve -->
        <path d="${mountainPathD}" fill="url(#mountain-gradient)" stroke="rgba(255,255,255,0.06)" stroke-width="1.5" />
        
        <!-- 3. The dashed curved trail (complete route) -->
        <path d="${dPath}" class="mountain-path" />

        <!-- 4. Glowing active progress path (completed portion of the route) -->
        ${dProgressPath ? `<path d="${dProgressPath}" class="mountain-path-progress" />` : ''}
        
        <!-- Mountain Peak Flag (Planted exactly at the top summit coordinate 275, 40) -->
        <g transform="translate(275, 40)">
            <line x1="0" y1="0" x2="0" y2="-18" stroke="#f43f5e" stroke-width="2" />
            <polygon points="0,-18 12,-13 0,-8" class="mountain-flag" />
        </g>
        
        <!-- Climber / Marker position -->
        <circle cx="${cx}" cy="${cy}" r="6" class="climber-marker" />
        
        <!-- Text details -->
        <text x="25" y="190" fill="rgba(255,255,255,0.3)" font-size="7" font-weight="900" text-anchor="middle">Base</text>
        <text x="275" y="190" fill="#f43f5e" font-size="7" font-weight="900" text-anchor="middle">Sommet</text>
    </svg>`;
}

async function updateRapportWeightAndFat() {
    const btn = document.getElementById('btn-save-rapport-peso');
    const originalText = btn.innerHTML;
    
    const newWeight = parseFloat(document.getElementById('rapport-weight-input').value) || 0;
    const newFat = parseFloat(document.getElementById('rapport-fat-input').value) || 0;
    
    if (newWeight <= 0) {
        showNotification("Poids non valide !", "error");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Traitement...';
    lucide.createIcons();

    // Recalculateur intelligent client-side
    const profile = JSON.parse(localStorage.getItem('fitbuddy_user_profile')) || {};
    
    // Mifflin-St Jeor formula
    const taille = parseFloat(profile.taille || 180);
    const age = parseFloat(profile.age || 30);
    const activityCoeff = 1.375; // Active
    
    const BMR = 10 * newWeight + 6.25 * taille - 5 * age + 5;
    const TDEE = Math.round(BMR * activityCoeff);
    
    const goal = profile.objectif_sportif || "Maintien";
    let newKcal = TDEE;
    
    if (goal.includes("Cut") || goal.includes("sèche")) newKcal -= 500;
    else if (goal.includes("Bulk") || goal.includes("masse")) newKcal += 350;
    else if (goal.includes("Hypertrophie")) newKcal += 200;
    else if (goal.includes("Recomp")) newKcal -= 200;

    const newProt = Math.round(newWeight * 2.2);
    const newLip = Math.round(newWeight * 0.9);
    const newGluc = Math.round((newKcal - (newProt * 4 + newLip * 9)) / 4);

    // Save to historical pesées locally
    let weightHistory = [];
    try {
        weightHistory = JSON.parse(localStorage.getItem('fitbuddy_weight_history')) || [];
    } catch(e) {}

    const todayStr = new Date().toISOString().substring(0, 10);
    const todayIndex = weightHistory.findIndex(h => h.date === todayStr);

    if (todayIndex >= 0) {
        weightHistory[todayIndex].poids = newWeight;
        weightHistory[todayIndex].masse_grasse = newFat;
    } else {
        weightHistory.push({
            date: todayStr,
            poids: newWeight,
            masse_grasse: newFat
        });
    }
    localStorage.setItem('fitbuddy_weight_history', JSON.stringify(weightHistory));

    // Détermination de la tendance par rapport à la pesée précédente
    let trend = "maintien";
    let trendHtml = "";
    if (weightHistory.length > 1) {
        const lastIndex = todayIndex >= 0 ? todayIndex : weightHistory.length - 1;
        const prevWeight = weightHistory[lastIndex - 1].poids;
        if (newWeight > prevWeight) {
            trend = "hausse";
            trendHtml = `<span class="trend-badge bg-emerald-500/10 text-emerald-400 font-extrabold uppercase gap-1 flex items-center">Hausse <i data-lucide="trending-up" class="w-3.5 h-3.5"></i></span>`;
        } else if (newWeight < prevWeight) {
            trend = "baisse";
            trendHtml = `<span class="trend-badge bg-red-500/10 text-red-400 font-extrabold uppercase gap-1 flex items-center">Baisse <i data-lucide="trending-down" class="w-3.5 h-3.5"></i></span>`;
        } else {
            trend = "maintien";
            trendHtml = `<span class="trend-badge bg-gray-500/10 text-gray-400 font-extrabold uppercase gap-1 flex items-center">Maintien <i data-lucide="minus" class="w-3.5 h-3.5"></i></span>`;
        }
    } else {
        trendHtml = `<span class="trend-badge bg-gray-500/10 text-gray-400 font-extrabold uppercase gap-1 flex items-center">Stable</span>`;
    }

    // Mise à jour de l'affichage
    document.getElementById('new-kcal-val').innerText = `${newKcal}`;
    document.getElementById('new-prot-val').innerText = `${newProt}g`;
    document.getElementById('new-gluc-val').innerText = `${newGluc}g`;
    document.getElementById('new-lip-val').innerText = `${newLip}g`;
    document.getElementById('recalculated-trend-badge').innerHTML = trendHtml;
    document.getElementById('recalculated-macros-area').classList.remove('hidden');

    // Mise à jour de l'API Notion en arrière-plan
    const payload = {
        email: userEmail,
        surnom: profile.surnom || profile.nom || "Athlète",
        objectif_sportif: goal,
        objectif_calorique: newKcal,
        objectif_proteines: newProt,
        objectif_glucides: newGluc,
        objectif_lipides: newLip,
        objectif_hydratation: profile.objectif_hydratation || 2.5,
        allergies: profile.allergies || [],
        aversions: profile.aversions || [],
        comportement_agent: profile.comportement_agent || "",
        type_objectif_corporel: profile.type_objectif_corporel || "poids",
        objectif_corporel_actuel: newWeight,
        objectif_corporel_but: parseFloat(profile.objectif_corporel_but || 85.0),
        objectif_corporel_initial: parseFloat(profile.objectif_corporel_initial || 110.0),
        mensurations: {
            ...profile.mensurations,
            poids: newWeight,
            masse_grasse: newFat
        }
    };

    try {
        const res = await fetch(`${N8N_URL}/webhook/update-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            localStorage.setItem('fitbuddy_user_profile', JSON.stringify(payload));
            showNotification("Pesée Notion & Macros synchronisées ! 🔄", "success");
        } else {
            console.warn("Soft fail update Notion:", data);
        }
    } catch(e) {
        console.warn("Offline weight logging saved locally", e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        lucide.createIcons();
    }
}

/* ──────────────────────────────────────────────────────────────────────────
   SOUS-MODULE GRAPHIQUES HISTORIQUES
   ────────────────────────────────────────────────────────────────────────── */

function openRapportChartModal() {
    const modal = document.getElementById('rapport-chart-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    // Remplissage du sélecteur interactif
    const select = document.getElementById('rapport-metric-select');
    if (select) {
        const metricLabels = {
            "poids": "Poids (kg)",
            "masse_grasse": "Masse Grasse (%)",
            "tour_de_taille": "Tour de Taille (cm)",
            "tour_de_hanche": "Tour de Hanche (cm)",
            "tour_cuisse_droite": "Cuisse Droite (cm)",
            "tour_cuisse_gauche": "Cuisse Gauche (cm)",
            "masse_musculaire": "Masse Musculaire (kg)",
            "graisse_viscerale": "Graisse Viscérale (idx)",
            "tour_de_cou": "Tour de Cou (cm)",
            "tour_epaules": "Tour Épaules (cm)",
            "tour_de_poitrine": "Tour Poitrine (cm)",
            "tour_bras_droit": "Bras Droit (cm)",
            "tour_bras_gauche": "Bras Gauche (cm)",
            "tour_mollet_droit": "Mollet Droit (cm)",
            "tour_mollet_gauche": "Mollet Gauche (cm)"
        };

        select.innerHTML = Object.entries(metricLabels)
            .map(([k, v]) => `<option value="${k}" class="bg-[#111] text-white">${v}</option>`)
            .join('');
    }

    renderRapportChart();
    if (window.lucide) lucide.createIcons();
}

function closeRapportChartModal() {
    const modal = document.getElementById('rapport-chart-modal');
    if (modal) modal.style.display = 'none';
}

function renderRapportChart() {
    const select = document.getElementById('rapport-metric-select');
    const body = document.getElementById('rapport-chart-body');
    if (!select || !body) return;

    const metric = select.value;
    
    // Récupération de l'historique
    let weightHistory = [];
    try {
        weightHistory = JSON.parse(localStorage.getItem('fitbuddy_weight_history')) || [];
    } catch(e) {}

    // S'assure d'avoir au moins une série
    let points = weightHistory.map(h => {
        let val = h[metric];
        if (val === undefined || val === null) {
            // Mocks réalistes pour les mensurations secondaires basés sur la tendance
            const profile = JSON.parse(localStorage.getItem('fitbuddy_user_profile')) || {};
            const refVal = parseFloat(profile.mensurations?.[metric] || 60);
            val = parseFloat((refVal + (Math.random() - 0.5) * (refVal * 0.05)).toFixed(1));
        }
        return { date: h.date, val: parseFloat(val) };
    });

    if (points.length === 0) {
        body.innerHTML = `<p class="text-xs text-white/40 italic">Données de pesée insuffisantes.</p>`;
        return;
    }

    // Tri par date croissante
    points.sort((a,b) => new Date(a.date) - new Date(b.date));

    // Construction du SVG Graph
    const width = 340;
    const height = 220;
    const paddingLeft = 35;
    const paddingRight = 15;
    const paddingTop = 25;
    const paddingBottom = 25;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const vals = points.map(p => p.val);
    const minVal = Math.min(...vals) * 0.98;
    const maxVal = Math.max(...vals) * 1.02;
    const valRange = maxVal - minVal || 1;

    // SVG point coordinates generators
    const getX = (idx) => paddingLeft + (idx / (points.length - 1 || 1)) * chartWidth;
    const getY = (val) => paddingTop + chartHeight - ((val - minVal) / valRange) * chartHeight;

    let svgLines = [];
    let pathPoints = [];

    // Horizontal Y Grids
    for (let g = 0; g <= 4; g++) {
        const gridVal = minVal + (valRange * g) / 4;
        const gy = getY(gridVal);
        svgLines.push(`
            <line x1="${paddingLeft}" y1="${gy}" x2="${width - paddingRight}" y2="${gy}" class="chart-grid-line" />
            <text x="${paddingLeft - 8}" y="${gy + 3}" fill="rgba(255,255,255,0.3)" font-size="7" font-weight="900" text-anchor="end">${gridVal.toFixed(1)}</text>
        `);
    }

    points.forEach((p, idx) => {
        const cx = getX(idx);
        const cy = getY(p.val);
        pathPoints.push(`${cx},${cy}`);

        // Short readable date (ex: 27/05)
        const dObj = new Date(p.date);
        const formattedDate = `${String(dObj.getDate()).padStart(2, '0')}/${String(dObj.getMonth()+1).padStart(2, '0')}`;

        svgLines.push(`
            <circle cx="${cx}" cy="${cy}" r="4.5" class="chart-dot" onclick="showChartTooltip(event, ${p.val}, '${p.date}')" />
            <text x="${cx}" y="${height - 8}" fill="rgba(255,255,255,0.3)" font-size="7" font-weight="900" text-anchor="middle">${formattedDate}</text>
        `);
    });

    const dPath = "M " + pathPoints.join(" L ");
    const dAreaPath = `${dPath} L ${getX(points.length - 1)},${height - paddingBottom} L ${getX(0)},${height - paddingBottom} Z`;

    body.innerHTML = `
    <div class="relative w-full flex flex-col justify-center items-center">
        <!-- Interactive Tooltip overlay -->
        <div id="chart-tooltip" class="absolute bg-fuchsia-950/80 backdrop-blur-xl border border-fuchsia-500/40 text-white rounded-xl py-1.5 px-3 text-[9px] font-black uppercase tracking-widest hidden pointer-events-none shadow-xl z-50"></div>

        <svg class="w-full h-full max-w-[340px] max-h-[220px]" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="chart-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#22d3ee" />
                    <stop offset="100%" stop-color="#d946ef" />
                </linearGradient>
                <linearGradient id="chart-area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#d946ef" stop-opacity="0.3" />
                    <stop offset="100%" stop-color="#d946ef" stop-opacity="0.0" />
                </linearGradient>
            </defs>
            <!-- Area under path -->
            <path d="${dAreaPath}" class="chart-area-fill" />
            <!-- Paths / curves -->
            <path d="${dPath}" class="chart-glow-path" />
            <!-- Grid lines & Data Dots -->
            ${svgLines.join('')}
        </svg>
    </div>`;
}

// Show responsive tooltips on dot log hover/click
window.showChartTooltip = function(e, value, date) {
    const tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) return;

    const dObj = new Date(date);
    const formattedDate = `${String(dObj.getDate()).padStart(2, '0')}/${String(dObj.getMonth()+1).padStart(2, '0')}`;

    tooltip.innerHTML = `<span class="text-fuchsia-400 font-extrabold mr-1">${value}</span> • le ${formattedDate}`;
    
    // Position calculation
    const rect = e.target.getBoundingClientRect();
    const parentRect = e.target.parentElement.getBoundingClientRect();
    const tooltipX = rect.left - parentRect.left + rect.width/2;
    const tooltipY = rect.top - parentRect.top - 28;

    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
    tooltip.classList.remove('hidden');

    // Auto-hide tooltip after 3 seconds
    clearTimeout(window.chartTooltipTimeout);
    window.chartTooltipTimeout = setTimeout(() => {
        tooltip.classList.add('hidden');
    }, 3000);
};

/* ──────────────────────────────────────────────────────────────────────────
   HUB DE NAVIGATION RADIAL (RADIAL GLASS WHEEL)
   ────────────────────────────────────────────────────────────────────────── */

window.toggleRadialMenu = function() {
    const container = document.getElementById('radial-menu-container');
    if (!container) return;

    container.classList.toggle('open');
    
    // Stop pulsing animation on trigger button after first interaction
    const trigger = document.getElementById('radial-trigger');
    if (trigger) {
        trigger.classList.remove('animate-pulse');
    }
};

window.triggerRadialAction = function(action) {
    triggerQuickAction(action);
    window.toggleRadialMenu();
};

// Bind direct clicks and prevent propagation on load
window.initRadialMenu = function() {
    const trigger = document.getElementById('radial-trigger');
    if (trigger) {
        // Remove older event listeners by replacing the node or using clone if necessary, 
        // but since we call it once, a clean addEventListener is standard.
        // We ensure we only bind once by setting a flag on the element.
        if (!trigger.dataset.bound) {
            trigger.addEventListener('click', function(e) {
                e.stopPropagation(); // Stops event bubbling to prevent document auto-close
                window.toggleRadialMenu();
            });
            trigger.dataset.bound = "true";
        }
    }

    const container = document.getElementById('radial-menu-container');
    if (container) {
        if (!container.dataset.bound) {
            container.addEventListener('click', function(e) {
                e.stopPropagation(); // Prevent clicks inside the container from bubbling
            });
            container.dataset.bound = "true";
        }
    }
};

// Initialize immediately and on DOMContentLoaded
window.initRadialMenu();
document.addEventListener('DOMContentLoaded', window.initRadialMenu);

// Automatic closing when clicking outside the radial menu hub
document.addEventListener('click', function(e) {
    const container = document.getElementById('radial-menu-container');
    if (container && container.classList.contains('open')) {
        window.toggleRadialMenu();
    }
});


/* ──────────────────────────────────────────────────────────────────────────
   FITBUDDY CALENDAR BOOSTER ENGINE & WIZARDS
   ────────────────────────────────────────────────────────────────────────── */

// 1. DATES HELPERS & CACHES
window.currentCalendarMonday = getMondayOfDate(new Date());
window.scheduledRemindersMap = {};

// Caches locaux d'initialisation pour RDV, Tâches, Événements et Repas cuisinés
let appointmentsCache = stringToJson(localStorage.getItem('fitbuddy_appointments')) || [];
let tasksCache = stringToJson(localStorage.getItem('fitbuddy_tasks')) || [];
let eventsCache = stringToJson(localStorage.getItem('fitbuddy_events')) || [];
let cookedMealsCache = stringToJson(localStorage.getItem('fitbuddy_cooked_meals')) || [];

function getMondayOfDate(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0,0,0,0);
    return monday;
}

function getWeekCode(d) {
    const monday = getMondayOfDate(d);
    const year = monday.getFullYear();
    const target = new Date(monday.valueOf());
    const dayNr = (monday.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getDayDate(mondayDate, dayIndex) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + dayIndex);
    return d;
}

// 2. PROFILE PHOTO HANDLERS
window.handleProfilePhotoUpload = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('profile-preview-img');
            const fallback = document.getElementById('profile-fallback-avatar');
            if (img) {
                img.src = e.target.result;
                img.classList.remove('hidden');
                img.dataset.base64 = e.target.result.split(',')[1];
                img.dataset.extension = input.files[0].name.split('.').pop();
            }
            if (fallback) fallback.classList.add('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.selectQuickAvatar = function(url) {
    const img = document.getElementById('profile-preview-img');
    const fallback = document.getElementById('profile-fallback-avatar');
    if (img) {
        img.src = url;
        img.classList.remove('hidden');
        delete img.dataset.base64; // Annule base64 si avatar rapide sélectionné
    }
    if (fallback) fallback.classList.add('hidden');
};

// 3. REMINDERS ENGINE (Option A PWA)
window.scheduleLocalReminder = function(item, type) {
    if (!window.Notification || Notification.permission !== 'granted') return;
    
    const apptDate = new Date(item.date);
    const reminderMin = parseInt(item.rappel || item.rappel_delai || 15);
    const triggerTime = apptDate.getTime() - (reminderMin * 60 * 1000);
    const now = Date.now();
    
    if (triggerTime > now) {
        const delay = triggerTime - now;
        const reminderId = `${type}-${item.id}`;
        
        // Annuler un rappel préexistant pour cet objet
        if (window.scheduledRemindersMap[reminderId]) {
            clearTimeout(window.scheduledRemindersMap[reminderId]);
        }
        
        window.scheduledRemindersMap[reminderId] = setTimeout(() => {
            new Notification(`FitBuddy - ${type === 'appt' ? 'Rendez-vous' : 'Événement'}`, {
                body: `"${item.name}" commence dans ${reminderMin} minutes !`,
                icon: 'icone.png'
            });
            delete window.scheduledRemindersMap[reminderId];
        }, delay);
    }
};

// Demander les permissions
if (window.Notification && Notification.permission === 'default') {
    Notification.requestPermission();
}

// 4. CALCUL DES TEMPS HEBDOMADAIRES (MATHEMATIQUE & FRACTIONNE)
window.calculateWeeklyDurations = function() {
    const currentWeek = getWeekCode(window.currentCalendarMonday);
    const durations = {};
    
    // Initialiser les membres du groupe
    const groupEmails = currentGroupMembers.length > 0 
        ? currentGroupMembers.map(e => e.trim().toLowerCase())
        : [(userEmail || "").trim().toLowerCase()];
        
    groupEmails.forEach(email => {
        durations[email] = 0;
    });

    // A. Calculer les repas cuisinés
    cookedMealsCache.forEach(meal => {
        if (meal.weekCode === currentWeek) {
            const chef = meal.chef ? meal.chef.trim().toLowerCase() : "";
            if (durations[chef] !== undefined) {
                durations[chef] += parseFloat(meal.duree || 0);
            }
        }
    });

    // B. Calculer les tâches de checklist validées (avec répartition)
    tasksCache.forEach(task => {
        const isCompleted = task.fait || (task.fait_semaines && task.fait_semaines.includes(currentWeek));
        
        if (isCompleted) {
            const dateObj = new Date(task.date);
            const taskWeek = getWeekCode(dateObj);
            const isRecurring = task.recurrence && task.recurrence !== 'Unique';
            
            // S'applique à la semaine active
            if (taskWeek === currentWeek || isRecurring) {
                const clickers = task.membres_qui_ont_fait || [];
                const taskDuration = parseFloat(task.duree || 0);
                
                if (clickers.length === 1) {
                    const u = clickers[0].trim().toLowerCase();
                    if (durations[u] !== undefined) durations[u] += taskDuration;
                } else if (clickers.length === 2) {
                    const u1 = clickers[0].trim().toLowerCase();
                    const u2 = clickers[1].trim().toLowerCase();
                    if (durations[u1] !== undefined) durations[u1] += Math.round(taskDuration * 0.66);
                    if (durations[u2] !== undefined) durations[u2] += Math.round(taskDuration * 0.33);
                } else if (clickers.length >= 3) {
                    const u1 = clickers[0].trim().toLowerCase();
                    const uRest = clickers.slice(1);
                    if (durations[u1] !== undefined) durations[u1] += Math.round(taskDuration * 0.50);
                    
                    const restShare = Math.round((taskDuration * 0.50) / uRest.length);
                    uRest.forEach(u => {
                        const email = u.trim().toLowerCase();
                        if (durations[email] !== undefined) durations[email] += restShare;
                    });
                }
            }
        }
    });

    return durations;
};

// 5. WEEK NAVIGATION
window.navigateCalendarWeek = function(direction) {
    const newDate = new Date(window.currentCalendarMonday);
    newDate.setDate(newDate.getDate() + (direction * 7));
    window.currentCalendarMonday = newDate;
    
    // Charger dynamiquement les données Notion pour la semaine
    const currentName = localStorage.getItem('fitbuddy_user_name');
    fetch(`${N8N_URL}/webhook/quick-action`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', "ngrok-skip-browser-warning": "69420" }, 
        body: JSON.stringify({ 
            action: 'calendar', 
            email: userEmail, 
            userName: currentName, 
            nom: currentName,
            week_monday: window.currentCalendarMonday.toISOString(),
            groupe: currentGroupName
        }) 
    })
    .then(res => res.json())
    .then(responseData => {
        const r = Array.isArray(responseData) ? responseData[0] : responseData;
        const rows = Array.isArray(r) ? r : (r.data || r.items || []);
        if (rows.length > 0) {
            window.currentWeekNotionRows = rows;
        } else {
            window.currentWeekNotionRows = null;
        }
        window.renderCalendarEngine();
    })
    .catch(() => {
        // En cas de panne de connexion, recharger les tâches et repas locaux
        window.currentWeekNotionRows = null;
        window.renderCalendarEngine();
    });
};

// Helper pour mapper l'e-mail ou nickname à son image
function getMemberAvatarUrl(emailOrNick) {
    const clean = String(emailOrNick).trim().toLowerCase();
    
    // Cas spécial si c'est notre utilisateur
    if (clean === (userEmail || "").trim().toLowerCase() || clean === (storedName || "").trim().toLowerCase()) {
        const profile = stringToJson(localStorage.getItem('fitbuddy_user_profile')) || {};
        if (profile.photo_profil || profile.photoProfil) {
            const path = profile.photo_profil || profile.photoProfil;
            return path.startsWith('http') || path.startsWith('data:') || path.startsWith('images/') ? path : `images/profils/${path}`;
        }
        return null;
    }
    
    // Chercher dans les autres membres du groupe locaux (si n8n a envoyé des photos)
    return null;
}

// Helper pour afficher un joli badge avatar
function renderUserAvatarBadge(emailOrNick, size = "w-7 h-7") {
    const url = getMemberAvatarUrl(emailOrNick);
    const initial = emailOrNick.charAt(0).toUpperCase();
    
    if (url) {
        return `<img src="${url}" class="${size} rounded-full object-cover border border-white/20 shadow-md avatar-group-item" title="${emailOrNick}" onerror="this.onerror=null; this.outerHTML='<div class=\'${size} rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[9px] border border-cyan-500/40 shadow-md\'>${initial}</div>'">`;
    }
    return `<div class="${size} rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-black text-[10px] border border-cyan-500/40 shadow-md avatar-group-item" title="${emailOrNick}">${initial}</div>`;
}

// 6. MAIN CALENDAR RENDERING ENGINE
window.renderCalendarEngine = function() {
    const container = document.getElementById('view-calendar');
    if (!container) return;
    
    const weekCode = getWeekCode(window.currentCalendarMonday);
    const formattedMonday = window.currentCalendarMonday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const sundayDate = new Date(window.currentCalendarMonday);
    sundayDate.setDate(sundayDate.getDate() + 6);
    const formattedSunday = sundayDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    
    // Calculer les compteurs de temps
    const durations = window.calculateWeeklyDurations();
    
    // Rendre la structure principale avec la Barre de Tracker Fixe en haut
    let html = `
    <!-- BARRE FIXE NAVIGATION & DUREES (Ne scrolle pas) -->
    <div class="glass-tracker-bar sticky top-0 left-0 right-0 p-3 space-y-3 border-b border-white/10 z-50">
        <!-- Navigateur de semaine -->
        <div class="flex items-center justify-between">
            <button onclick="navigateCalendarWeek(-1)" class="w-8 h-8 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white active:scale-90 transition-transform">
                <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <div class="flex items-center gap-2">
                <i data-lucide="calendar" class="w-3.5 h-3.5 text-rose-400"></i>
                <span class="text-xs font-black text-white uppercase tracking-wider">${formattedMonday} au ${formattedSunday}</span>
            </div>
            <button onclick="navigateCalendarWeek(1)" class="w-8 h-8 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white active:scale-90 transition-transform">
                <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
        </div>
        
        <!-- Compteur de Duree de Taches -->
        <div class="flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
            <span class="text-[8px] font-black text-white/30 uppercase tracking-widest flex-none">Cumul Hebdo :</span>
            <div class="flex gap-4">`;
            
            Object.keys(durations).forEach(member => {
                const totalMin = durations[member];
                const hours = Math.floor(totalMin / 60);
                const mins = totalMin % 60;
                const formattedTime = hours > 0 ? `${hours}h${mins}` : `${mins}m`;
                
                html += `
                <div class="flex items-center gap-2 bg-white/[0.03] border border-white/5 px-2.5 py-1 rounded-2xl flex-none">
                    ${renderUserAvatarBadge(member, "w-6 h-6")}
                    <span class="text-[10px] font-black text-cyan-400 font-mono">${formattedTime}</span>
                </div>`;
            });
            
    html += `
            </div>
        </div>
    </div>
    
    <!-- CONTENU SCROLLABLE (Jours de la semaine) -->
    <div id="calendar-scrollable-content" class="flex-1 overflow-y-auto no-scrollbar p-2 pb-28 space-y-4">`;

    // Récupérer les lignes de repas Notion
    const rows = window.currentWeekNotionRows || [];
    const LundiLigne = rows[0] || {};
    const RecenteLigne = rows[1] || {};
    const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    
    jours.forEach((j, index) => {
        const currentDayDate = getDayDate(window.currentCalendarMonday, index);
        const dayStr = currentDayDate.toISOString().substring(0, 10);
        
        // Repas
        const source = (j === "Lundi") ? LundiLigne : RecenteLigne;
        const midiId = source[`${j.toLowerCase()}_midi`] || "";
        const soirId = source[`${j.toLowerCase()}_soir`] || "";
        
        const findInCache = (id) => {
            if (!id) return null;
            const cleanId = String(id).replace(/-/g, '').toLowerCase();
            return recipesCache.find(r => String(r.id).replace(/-/g, '').toLowerCase() === cleanId);
        };

        const recetteMidi = findInCache(midiId);
        const recetteSoir = findInCache(soirId);

        const midiNom = recetteMidi ? (recetteMidi.property_nom || recetteMidi.name || recetteMidi.nom) : "Non défini";
        const soirNom = recetteSoir ? (recetteSoir.property_nom || recetteSoir.name || recetteSoir.nom) : "Non défini";
        
        const getImagePath = (recette, backupPhotoColumn) => {
            let photoRaw = recette ? (recette.property_photo || recette.photo) : backupPhotoColumn;
            if (!photoRaw) return 'images/recettes/default-recipe.jpg';
            let item = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
            let pathStr = "";
            if (typeof item === 'string') pathStr = item.trim();
            else if (item && typeof item === 'object') {
                pathStr = item.name || (item.file ? item.file.url : (item.external ? item.external.url : ""));
            }
            return pathStr.startsWith('http') || pathStr.startsWith('data:') ? pathStr : `images/recettes/${pathStr}`;
        };

        const imgMidi = getImagePath(recetteMidi, source[`photo_${j.toLowerCase()}_midi`]);
        const imgSoir = getImagePath(recetteSoir, source[`photo_${j.toLowerCase()}_soir`]);
        
        // Vérifier si cuisinés
        const isMidiCooked = cookedMealsCache.some(m => m.weekCode === weekCode && m.day === j.toLowerCase() && m.slot === 'midi');
        const isSoirCooked = cookedMealsCache.some(m => m.weekCode === weekCode && m.day === j.toLowerCase() && m.slot === 'soir');

        // Filtrer les rendez-vous, tâches, événements du jour (avec récurrences)
        const dayAppointments = appointmentsCache.filter(item => {
            const itemDate = new Date(item.date);
            const isSameDay = itemDate.toISOString().substring(0, 10) === dayStr;
            const isRecurring = item.recurrence && item.recurrence !== 'Unique';
            
            if (isSameDay) return true;
            if (isRecurring) {
                if (item.recurrence === 'Daily') return true;
                if (item.recurrence === 'Weekly') return itemDate.getDay() === currentDayDate.getDay();
                if (item.recurrence === 'Monthly') return itemDate.getDate() === currentDayDate.getDate();
            }
            return false;
        });

        const dayTasks = tasksCache.filter(item => {
            const itemDate = new Date(item.date);
            const isSameDay = itemDate.toISOString().substring(0, 10) === dayStr;
            const isRecurring = item.recurrence && item.recurrence !== 'Unique';
            
            if (isSameDay) return true;
            if (isRecurring) {
                if (item.recurrence === 'Daily') return true;
                if (item.recurrence === 'Weekly') return itemDate.getDay() === currentDayDate.getDay();
                if (item.recurrence === 'Monthly') return itemDate.getDate() === currentDayDate.getDate();
            }
            return false;
        });

        const dayEvents = eventsCache.filter(item => {
            const itemDate = new Date(item.date);
            const isSameDay = itemDate.toISOString().substring(0, 10) === dayStr;
            const isRecurring = item.recurrence && item.recurrence !== 'Unique';
            
            if (isSameDay) return true;
            if (isRecurring) {
                if (item.recurrence === 'Daily') return true;
                if (item.recurrence === 'Weekly') return itemDate.getDay() === currentDayDate.getDay();
                if (item.recurrence === 'Monthly') return itemDate.getDate() === currentDayDate.getDate();
            }
            return false;
        });

        html += `
        <div class="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4 shadow-xl">
            <!-- Jour & Date -->
            <div class="flex justify-between items-center border-b border-white/10 pb-2">
                <h3 class="text-xs font-black text-rose-400 uppercase tracking-wider">${j}</h3>
                <span class="text-[9px] font-bold text-white/30 uppercase tracking-wider">${currentDayDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
            </div>
            
            <!-- SECTION REPAS -->
            <div class="grid grid-cols-2 gap-4">
                <!-- Midi -->
                <div onclick="openMealActionModal('${j}', 'midi', '${recetteMidi ? recetteMidi.id : ''}')" class="relative overflow-hidden cursor-pointer bg-white/[0.02] p-2.5 rounded-2xl border ${isMidiCooked ? 'border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-white/5'} flex flex-col justify-between hover:bg-white/[0.05] active:scale-95 transition-all">
                    <div class="space-y-1">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5 text-[9px] font-black text-cyan-400 uppercase tracking-widest">
                                <i data-lucide="sun" class="w-3 h-3"></i> Midi
                            </div>
                            ${isMidiCooked ? '<span class="text-[7px] bg-cyan-500 text-black px-1.5 py-0.5 rounded-md font-bold uppercase">Fait !</span>' : ''}
                        </div>
                        <p class="text-[10px] font-bold text-white leading-snug line-clamp-2">${midiNom}</p>
                    </div>
                    <div class="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-white/10 bg-white/5 mt-2">
                        <img src="${imgMidi}" class="w-full h-full object-cover ${isMidiCooked ? 'brightness-50' : ''}" onerror="this.onerror=null; this.src='images/recettes/default-recipe.jpg';">
                    </div>
                </div>
                
                <!-- Soir -->
                <div onclick="openMealActionModal('${j}', 'soir', '${recetteSoir ? recetteSoir.id : ''}')" class="relative overflow-hidden cursor-pointer bg-white/[0.02] p-2.5 rounded-2xl border ${isSoirCooked ? 'border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.1)]' : 'border-white/5'} flex flex-col justify-between hover:bg-white/[0.05] active:scale-95 transition-all">
                    <div class="space-y-1">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5 text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                <i data-lucide="moon" class="w-3 h-3"></i> Soir
                            </div>
                            ${isSoirCooked ? '<span class="text-[7px] bg-cyan-500 text-black px-1.5 py-0.5 rounded-md font-bold uppercase">Fait !</span>' : ''}
                        </div>
                        <p class="text-[10px] font-bold text-white leading-snug line-clamp-2">${soirNom}</p>
                    </div>
                    <div class="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-white/10 bg-white/5 mt-2">
                        <img src="${imgSoir}" class="w-full h-full object-cover ${isSoirCooked ? 'brightness-50' : ''}" onerror="this.onerror=null; this.src='images/recettes/default-recipe.jpg';">
                    </div>
                </div>
            </div>
            
            <!-- SECTION RENDEZ-VOUS -->
            <div class="space-y-2.5 pt-1">
                <div class="flex justify-between items-center border-t border-white/5 pt-2">
                    <span class="text-[9px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1"><i data-lucide="calendar-check" class="w-3.5 h-3.5 text-cyan-400"></i> Rendez-vous</span>
                    <button onclick="openAddAppointmentModal('${dayStr}')" class="text-[8px] font-black bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-2 py-0.5 rounded-md uppercase tracking-wider hover:bg-cyan-500 hover:text-black transition-colors">+ Ajouter</button>
                </div>
                <div class="space-y-2">
                    ${dayAppointments.length === 0 ? '<p class="text-[8px] text-white/20 italic ml-1">Aucun rendez-vous planifié</p>' : dayAppointments.map(appt => `
                        <div class="flex items-center justify-between bg-white/[0.02] border border-white/5 p-2 rounded-xl">
                            <div class="flex items-center gap-3">
                                <div class="text-right">
                                    <p class="text-[9px] font-black text-cyan-400 font-mono">${appt.time}</p>
                                    <p class="text-[7px] text-white/30 uppercase font-bold font-mono">${appt.duree}m</p>
                                </div>
                                <div class="border-l border-white/10 h-6"></div>
                                <div>
                                    <p class="text-[10px] font-bold text-white leading-tight uppercase">${appt.name}</p>
                                    ${appt.localisation ? `<p class="text-[7px] text-white/40 flex items-center gap-1 mt-0.5"><i data-lucide="map-pin" class="w-2 h-2 text-rose-400"></i> ${appt.localisation}</p>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="flex -space-x-1.5 overflow-hidden">
                                    ${(appt.assignes || []).map(email => renderUserAvatarBadge(email, "w-5 h-5"))}
                                </div>
                                <button onclick="deleteCalendarItem('appt', '${appt.id}')" class="text-red-500/40 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- SECTION CHECKLIST (TACHES) -->
            <div class="space-y-2.5 pt-1">
                <div class="flex justify-between items-center border-t border-white/5 pt-2">
                    <span class="text-[9px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1"><i data-lucide="check-square" class="w-3.5 h-3.5 text-purple-400"></i> Tâches (To-Do)</span>
                    <button onclick="openAddTaskModal('${dayStr}')" class="text-[8px] font-black bg-purple-500/10 border border-purple-500/30 text-purple-400 px-2 py-0.5 rounded-md uppercase tracking-wider hover:bg-purple-500 hover:text-white transition-colors">+ Ajouter</button>
                </div>
                <div class="space-y-2">
                    ${dayTasks.length === 0 ? '<p class="text-[8px] text-white/20 italic ml-1">Aucune tâche répertoriée</p>' : dayTasks.map(task => {
                        const isTaskDone = task.fait || (task.fait_semaines && task.fait_semaines.includes(weekCode));
                        return `
                        <div class="flex items-center justify-between bg-white/[0.02] border border-white/5 p-2 rounded-xl ${isTaskDone ? 'opacity-50' : ''}">
                            <div class="flex items-center gap-3">
                                <input type="checkbox" ${isTaskDone ? 'checked' : ''} onchange="toggleTaskFait('${task.id}', '${dayStr}')" class="rounded bg-white/5 border-white/10 text-purple-600 focus:ring-0 w-4 h-4 cursor-pointer">
                                <div>
                                    <p class="text-[10px] font-bold text-white leading-tight uppercase ${isTaskDone ? 'line-through text-white/40' : ''}">${task.name}</p>
                                    <span class="text-[7px] text-white/30 font-black uppercase font-mono">${task.duree} min</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="flex -space-x-1.5 overflow-hidden">
                                    ${(task.assignes || []).map(email => renderUserAvatarBadge(email, "w-5 h-5"))}
                                </div>
                                <button onclick="deleteCalendarItem('task', '${task.id}')" class="text-red-500/40 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
            
            <!-- SECTION EVENTS (PUBLIC GROUPE) -->
            <div class="space-y-2.5 pt-1">
                <div class="flex justify-between items-center border-t border-white/5 pt-2">
                    <span class="text-[9px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1"><i data-lucide="users" class="w-3.5 h-3.5 text-amber-500"></i> Événements Publics</span>
                    <button onclick="openAddEventModal('${dayStr}')" class="text-[8px] font-black bg-amber-500/10 border border-amber-500/30 text-amber-500 px-2 py-0.5 rounded-md uppercase tracking-wider hover:bg-amber-500 hover:text-black transition-colors">+ Ajouter</button>
                </div>
                <div class="space-y-2">
                    ${dayEvents.length === 0 ? '<p class="text-[8px] text-white/20 italic ml-1">Aucun événement planifié</p>' : dayEvents.map(evt => `
                        <div class="flex items-center justify-between bg-white/[0.02] border border-white/5 p-2.5 rounded-xl border-l-2 border-l-amber-500 shadow-md">
                            <div class="flex items-center gap-3">
                                <div>
                                    <p class="text-[9px] font-black text-amber-400 font-mono">${evt.time}</p>
                                </div>
                                <div class="border-l border-white/10 h-6"></div>
                                <div>
                                    <p class="text-[10px] font-black text-white leading-tight uppercase">${evt.name}</p>
                                    ${evt.localisation ? `<p class="text-[7px] text-white/40 flex items-center gap-1 mt-0.5"><i data-lucide="map-pin" class="w-2 h-2 text-rose-400"></i> ${evt.localisation}</p>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-3">
                                <div class="flex -space-x-1.5 overflow-hidden">
                                    ${(evt.assignes || []).map(email => renderUserAvatarBadge(email, "w-5 h-5"))}
                                </div>
                                <button onclick="deleteCalendarItem('event', '${evt.id}')" class="text-red-500/40 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    });

    html += `
    </div>
    
    <!-- BOUTON FLOTTANT GENERER EN BAS A DROITE -->
    <button id="floating-calendar-generate" class="floating-add-btn !bg-violet-600 border !border-violet-400/30 shadow-[0_0_20px_rgba(139,92,246,0.4)]" onclick="openGenerateOptions()" style="bottom: 85px; right: 20px; z-index: 9999;">
        <i data-lucide="sparkles" class="w-7 h-7 text-white"></i>
    </button>`;
    
    container.innerHTML = html;
    lucide.createIcons();
    setTimeout(() => { container.scrollTo({ top: 0, behavior: 'instant' }); }, 100);
};

// 7. MEAL ACTION MODAL POPUP & IN-APP MARK DONE
let activeMealDay = "";
let activeMealSlot = "";
let activeMealRecipeId = "";

window.openMealActionModal = function(day, slot, recipeId) {
    activeMealDay = day;
    activeMealSlot = slot;
    activeMealRecipeId = recipeId;
    
    const modal = document.getElementById('meal-action-modal');
    const title = document.getElementById('meal-action-title');
    const subtitle = document.getElementById('meal-action-subtitle');
    const img = document.getElementById('meal-action-img');
    const duration = document.getElementById('meal-action-duration');
    const chefSelect = document.getElementById('meal-chef-selection-container');
    const chefAvatars = document.getElementById('meal-chef-avatars');
    const consumersSelect = document.getElementById('meal-consumers-selection-container');
    const consumersAvatars = document.getElementById('meal-consumers-avatars');
    
    if(!modal) return;
    
    const recipe = recipesCache.find(r => String(r.id) === String(recipeId));
    const recipeName = recipe ? (recipe.property_nom || recipe.nom || recipe.name) : "Non défini";
    const prepTime = recipe ? (recipe.temps || recipe.property_dur_e || 15) : 15;
    
    title.innerText = recipeName;
    subtitle.innerText = `${day} • ${slot === 'midi' ? 'Déjeuner' : 'Dîner'}`;
    duration.innerText = `${prepTime} min`;
    
    // Charger la photo
    let photoRaw = recipe ? (recipe.property_photo || recipe.photo) : null;
    let photoStr = "";
    if (photoRaw) {
        let item = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
        if (typeof item === 'string') photoStr = item.trim();
        else if (item && typeof item === 'object') photoStr = item.name || (item.file ? item.file.url : (item.external ? item.external.url : ""));
    }
    const path = photoStr || 'default-recipe.jpg';
    img.src = path.startsWith('http') || path.startsWith('data:') ? path : `images/recettes/${path}`;
    
    // Si nous sommes dans un groupe, afficher la liste des colocs pour choisir qui cuisine et qui mange
    const groupEmails = currentGroupMembers.length > 0 
        ? currentGroupMembers.map(e => e.trim().toLowerCase())
        : [(userEmail || "").trim().toLowerCase()];
        
    const weekCode = getWeekCode(window.currentCalendarMonday);
    const existing = cookedMealsCache.find(m => m.weekCode === weekCode && m.day === day.toLowerCase() && m.slot === slot);
    
    if (existing) {
        window.selectedMealChefEmail = existing.chef || (userEmail || "").toLowerCase();
        window.selectedMealConsumers = existing.prepare_pour || [...groupEmails];
    } else {
        window.selectedMealChefEmail = (userEmail || "").toLowerCase();
        window.selectedMealConsumers = [...groupEmails]; // Par défaut, tout le monde mange le repas
    }
    
    // Rendu "Qui a cuisiné ?"
    if (groupEmails.length > 1) {
        chefSelect.classList.remove('hidden');
        chefAvatars.innerHTML = groupEmails.map(email => `
            <div onclick="selectMealChef('${email}')" id="chef-opt-${email.replace(/[^a-z0-9]/g, '-')}" class="visual-avatar-select w-10 h-10 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-transparent ${email === window.selectedMealChefEmail ? 'selected border-cyan-400 shadow-md' : ''}">
                ${renderUserAvatarBadge(email, "w-full h-full")}
            </div>
        `).join('');
    } else {
        chefSelect.classList.add('hidden');
    }
    
    // Rendu "Préparé pour" (Nouveau)
    if (groupEmails.length > 1) {
        consumersSelect.classList.remove('hidden');
        consumersAvatars.innerHTML = groupEmails.map(email => {
            const isSelected = window.selectedMealConsumers.includes(email);
            return `
                <div onclick="window.toggleMealConsumer('${email}')" id="consumer-opt-${email.replace(/[^a-z0-9]/g, '-')}" class="visual-avatar-select w-10 h-10 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-transparent transition-all cursor-pointer ${isSelected ? 'selected border-cyan-400 shadow-md' : 'opacity-40'}">
                    ${renderUserAvatarBadge(email, "w-full h-full")}
                </div>
            `;
        }).join('');
    } else {
        consumersSelect.classList.add('hidden');
    }
    
    // Style du bouton de confirmation
    const confirmBtn = document.getElementById('btn-confirm-cooked');
    if (existing) {
        confirmBtn.innerText = "Décocher";
        confirmBtn.classList.remove('bg-cyan-500', 'text-black');
        confirmBtn.classList.add('bg-red-500/20', 'border', 'border-red-500/50', 'text-red-400');
    } else {
        confirmBtn.innerText = "Cuisiné !";
        confirmBtn.classList.add('bg-cyan-500', 'text-black');
        confirmBtn.classList.remove('bg-red-500/20', 'border', 'border-red-500/50', 'text-red-400');
    }
    
    // Attacher le trigger pour remplacer la recette
    document.getElementById('btn-replace-meal').onclick = function() {
        closeMealActionModal();
        openRecipePickerForReplacement(day, slot);
    };
    
    // Attacher le trigger de validation
    document.getElementById('btn-confirm-cooked').onclick = function() {
        window.confirmMealCooked(prepTime);
    };
    
    modal.style.display = 'flex';
    lucide.createIcons();
};

window.toggleMealConsumer = function(email) {
    if (!window.selectedMealConsumers) window.selectedMealConsumers = [];
    const idx = window.selectedMealConsumers.indexOf(email);
    const target = document.getElementById(`consumer-opt-${email.replace(/[^a-z0-9]/g, '-')}`);
    
    if (idx > -1) {
        // Empêcher de désélectionner tout le monde (au moins 1 personne doit manger)
        if (window.selectedMealConsumers.length === 1) return;
        window.selectedMealConsumers.splice(idx, 1);
        if (target) {
            target.classList.remove('selected', 'border-cyan-400');
            target.classList.add('opacity-40');
        }
    } else {
        window.selectedMealConsumers.push(email);
        if (target) {
            target.classList.add('selected', 'border-cyan-400');
            target.classList.remove('opacity-40');
        }
    }
};

window.selectMealChef = function(email) {
    document.querySelectorAll('#meal-chef-avatars .visual-avatar-select').forEach(el => el.classList.remove('selected', 'border-cyan-400'));
    const target = document.getElementById(`chef-opt-${email.replace(/[^a-z0-9]/g, '-')}`);
    if (target) target.classList.add('selected', 'border-cyan-400');
    window.selectedMealChefEmail = email;
};

window.closeMealActionModal = function() {
    const modal = document.getElementById('meal-action-modal');
    if(modal) modal.style.display = 'none';
};

window.confirmMealCooked = function(prepTime) {
    const weekCode = getWeekCode(window.currentCalendarMonday);
    
    // Vérifier si le repas est déjà cuisiné pour l'inverser (toggle)
    const existingIndex = cookedMealsCache.findIndex(m => m.weekCode === weekCode && m.day === activeMealDay.toLowerCase() && m.slot === activeMealSlot);
    
    if (existingIndex > -1) {
        // Enlever
        cookedMealsCache.splice(existingIndex, 1);
        showNotification("Repas décoché ✓", "info");
    } else {
        // Ajouter
        cookedMealsCache.push({
            id: `cooked-${Date.now()}`,
            weekCode: weekCode,
            day: activeMealDay.toLowerCase(),
            slot: activeMealSlot,
            chef: window.selectedMealChefEmail,
            recipeId: activeMealRecipeId,
            duree: prepTime,
            prepare_pour: window.selectedMealConsumers || [(userEmail || "").toLowerCase()]
        });
        showNotification("Cuisiné ! Temps de préparation ajouté ✓", "success");
    }
    
    localStorage.setItem('fitbuddy_cooked_meals', JSON.stringify(cookedMealsCache));
    
    // Synchroniser avec n8n en arrière-plan
    try {
        fetch(`${N8N_URL}/webhook/calendar-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'toggle-meal',
                weekCode: weekCode,
                day: activeMealDay.toLowerCase(),
                slot: activeMealSlot,
                chef: window.selectedMealChefEmail,
                recipeId: activeMealRecipeId,
                duree: prepTime,
                prepare_pour: window.selectedMealConsumers || [(userEmail || "").toLowerCase()],
                fait: existingIndex === -1,
                email: userEmail
            })
        });
    } catch(e) {}
    
    closeMealActionModal();
    window.renderCalendarEngine();
};

// Sélecteur de remplacement de repas
function openRecipePickerForReplacement(day, slot) {
    const modal = document.getElementById('recipe-picker-modal');
    const body = document.getElementById('recipe-picker-body');
    const floatBtn = document.getElementById('picker-float-btn');
    
    if (!modal || !body) return;
    
    floatBtn.style.display = 'none'; // Pas de multi-sélection nécessaire
    
    // Filtrer les recettes
    const filteredRecipes = getFilteredItems(recipesCache, activeRecipeFilter);
    
    body.innerHTML = `
    <div class="px-5 py-3 border-b border-white/5">
        <p class="text-[9px] text-white/40 uppercase font-black tracking-widest">Sélectionnez le repas de remplacement pour ${day} ${slot === 'midi' ? 'Midi' : 'Soir'}</p>
    </div>
    <div class="p-5 grid grid-cols-2 gap-4">
        ${filteredRecipes.map(r => {
            const recipeTitle = r.property_nom || r.nom || r.name || "";
            let photoRaw = r.property_photo || r.photo;
            let photoStr = "";
            if (photoRaw) {
                let item = Array.isArray(photoRaw) ? photoRaw[0] : photoRaw;
                if (typeof item === 'string') photoStr = item.trim();
                else if (item && typeof item === 'object') photoStr = item.name || (item.file ? item.file.url : (item.external ? item.external.url : ""));
            }
            const path = photoStr || 'default-recipe.jpg';
            const imgPath = path.startsWith('http') || path.startsWith('data:') ? path : `images/recettes/${path}`;
            
            return `
            <div onclick="selectReplacementRecipe('${day}', '${slot}', '${r.id}')" class="bg-white/5 border border-white/10 rounded-2xl p-2.5 hover:border-cyan-400 active:scale-95 transition-all cursor-pointer">
                <div class="relative w-full aspect-[4/3] rounded-xl overflow-hidden mb-2 bg-white/5 border border-white/10">
                    <img src="${imgPath}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='images/recettes/default-recipe.jpg';">
                </div>
                <p class="text-[9px] font-black text-white line-clamp-2 uppercase">${recipeTitle}</p>
            </div>`;
        }).join('')}
    </div>`;
    
    modal.style.display = 'flex';
    lucide.createIcons();
}

window.selectReplacementRecipe = async function(day, slot, recipeId) {
    const modal = document.getElementById('recipe-picker-modal');
    if (modal) modal.style.display = 'none';
    
    showNotification("Remplacement en cours...", "info");
    
    // 1. Mettre à jour Notion en arrière-plan via le webhook n8n
    try {
        const currentName = localStorage.getItem('fitbuddy_user_name');
        const res = await fetch(`${N8N_URL}/webhook/quick-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '69420' },
            body: JSON.stringify({
                action: 'replace-meal',
                email: userEmail,
                userName: currentName,
                day: day.toLowerCase(),
                slot: slot.toLowerCase(),
                recipeId: recipeId,
                weekMonday: window.currentCalendarMonday.toISOString()
            })
        });
        const data = await res.json();
        const r = Array.isArray(data) ? data[0] : data;
        const rows = Array.isArray(r) ? r : (r.data || r.items || []);
        
        if (rows.length > 0) {
            window.currentWeekNotionRows = rows;
            showNotification("Planning mis à jour sur Notion !", "success");
        } else {
            throw new Error("Lignes invalides");
        }
    } catch (e) {
        console.warn("Échec de la sauvegarde Notion, modification locale uniquement", e);
        // Fallback local
        if (!window.currentWeekNotionRows || window.currentWeekNotionRows.length === 0) {
            window.currentWeekNotionRows = [{}, {}];
        }
        const targetRow = (day.toLowerCase() === 'lundi') ? window.currentWeekNotionRows[0] : window.currentWeekNotionRows[1];
        if (targetRow) {
            targetRow[`${day.toLowerCase()}_${slot}`] = recipeId;
        }
        showNotification("Planning mis à jour en local !", "success");
    }
    
    window.renderCalendarEngine();
};

// 8. ADD/EDIT RENDEZ-VOUS MODAL
let activeItemDayStr = "";

window.openAddAppointmentModal = function(dayStr) {
    activeItemDayStr = dayStr;
    const modal = document.getElementById('add-appointment-modal');
    if (!modal) return;
    
    // Titres & inputs par défaut
    document.getElementById('appt-name').value = "";
    document.getElementById('appt-time').value = "10:00";
    document.getElementById('appt-duration').value = "30";
    document.getElementById('appt-location').value = "";
    document.getElementById('appt-recurrence').value = "Unique";
    document.getElementById('appt-reminder').value = "15";
    
    // Affichage des avatars d'assignation
    const avatarsDiv = document.getElementById('appt-assignees-avatars');
    const groupEmails = currentGroupMembers.length > 0 
        ? currentGroupMembers.map(e => e.trim().toLowerCase())
        : [(userEmail || "").trim().toLowerCase()];
        
    avatarsDiv.innerHTML = groupEmails.map(email => `
        <div onclick="toggleAssigneeSelect('appt', '${email}')" id="appt-assign-${email.replace(/[^a-z0-9]/g, '-')}" class="visual-avatar-select w-9 h-9 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-transparent selected border-cyan-400 shadow-md">
            ${renderUserAvatarBadge(email, "w-full h-full")}
        </div>
    `).join('');
    
    window.selectedApptAssignees = [...groupEmails];
    
    // Attacher le trigger de validation
    document.getElementById('btn-save-appointment').onclick = function() {
        window.saveAppointment();
    };
    
    modal.style.display = 'flex';
    lucide.createIcons();
};

window.closeAddAppointmentModal = function() {
    const modal = document.getElementById('add-appointment-modal');
    if(modal) modal.style.display = 'none';
};

window.toggleAssigneeSelect = function(type, email) {
    const list = type === 'appt' ? window.selectedApptAssignees : type === 'task' ? window.selectedTaskAssignees : window.selectedEventAssignees;
    const target = document.getElementById(`${type}-assign-${email.replace(/[^a-z0-9]/g, '-')}`);
    
    const idx = list.indexOf(email);
    if (idx > -1) {
        list.splice(idx, 1);
        if (target) target.classList.remove('selected', 'border-cyan-400');
    } else {
        list.push(email);
        if (target) target.classList.add('selected', 'border-cyan-400');
    }
};

window.saveAppointment = async function() {
    const name = document.getElementById('appt-name').value.trim();
    const time = document.getElementById('appt-time').value;
    const duration = parseInt(document.getElementById('appt-duration').value) || 30;
    const loc = document.getElementById('appt-location').value.trim();
    const recurrence = document.getElementById('appt-recurrence').value;
    const reminder = parseInt(document.getElementById('appt-reminder').value);
    
    if (!name) {
        alert("Veuillez donner un nom au rendez-vous.");
        return;
    }
    
    const appt = {
        id: `appt-${Date.now()}`,
        name: name,
        date: `${activeItemDayStr}T${time}:00`,
        time: time,
        duree: duration,
        localisation: loc,
        assignes: window.selectedApptAssignees,
        recurrence: recurrence,
        rappel: reminder,
        email: userEmail
    };
    
    appointmentsCache.push(appt);
    localStorage.setItem('fitbuddy_appointments', JSON.stringify(appointmentsCache));
    
    // Planifier le rappel local (Option A)
    if (reminder > 0) {
        window.scheduleLocalReminder(appt, 'appt');
    }
    
    // Synchroniser avec n8n en arrière-plan
    try {
        fetch(`${N8N_URL}/webhook/calendar-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create-appt', appt: appt, email: userEmail })
        });
    } catch(e) {}
    
    showNotification("Rendez-vous créé ✓", "success");
    closeAddAppointmentModal();
    window.renderCalendarEngine();
};

// 9. CHECKLIST (TACHES) ADD/EDIT MODAL
window.openAddTaskModal = function(dayStr) {
    activeItemDayStr = dayStr;
    const modal = document.getElementById('add-task-modal');
    if (!modal) return;
    
    document.getElementById('task-name').value = "";
    document.getElementById('task-duration').value = "15";
    document.getElementById('task-recurrence').value = "Unique";
    
    // Avatars d'assignation
    const avatarsDiv = document.getElementById('task-assignees-avatars');
    const groupEmails = currentGroupMembers.length > 0 
        ? currentGroupMembers.map(e => e.trim().toLowerCase())
        : [(userEmail || "").trim().toLowerCase()];
        
    avatarsDiv.innerHTML = groupEmails.map(email => `
        <div onclick="toggleAssigneeSelect('task', '${email}')" id="task-assign-${email.replace(/[^a-z0-9]/g, '-')}" class="visual-avatar-select w-9 h-9 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-transparent selected border-cyan-400 shadow-md">
            ${renderUserAvatarBadge(email, "w-full h-full")}
        </div>
    `).join('');
    
    window.selectedTaskAssignees = [...groupEmails];
    
    document.getElementById('btn-save-task').onclick = function() {
        window.saveTask();
    };
    
    modal.style.display = 'flex';
    lucide.createIcons();
};

window.closeAddTaskModal = function() {
    const modal = document.getElementById('add-task-modal');
    if(modal) modal.style.display = 'none';
};

window.saveTask = function() {
    const name = document.getElementById('task-name').value.trim();
    const duration = parseInt(document.getElementById('task-duration').value) || 15;
    const recurrence = document.getElementById('task-recurrence').value;
    
    if(!name) {
        alert("Veuillez saisir un nom pour la tâche.");
        return;
    }
    
    const task = {
        id: `task-${Date.now()}`,
        name: name,
        date: activeItemDayStr,
        duree: duration,
        fait: false,
        fait_semaines: [],
        assignes: window.selectedTaskAssignees,
        recurrence: recurrence,
        membres_qui_ont_fait: [],
        email: userEmail
    };
    
    tasksCache.push(task);
    localStorage.setItem('fitbuddy_tasks', JSON.stringify(tasksCache));
    
    // Sync n8n
    try {
        fetch(`${N8N_URL}/webhook/calendar-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create-task', task: task, email: userEmail })
        });
    } catch(e) {}
    
    showNotification("Tâche créée ✓", "success");
    closeAddTaskModal();
    window.renderCalendarEngine();
};

// Estimations IA de durée avec Tyler en local
window.estimateTaskDurationAI = function() {
    const name = document.getElementById('task-name').value.trim();
    const durationInput = document.getElementById('task-duration');
    
    if (!name) {
        alert("Saisissez d'abord un intitulé de tâche pour que Tyler l'évalue !");
        return;
    }
    
    const btn = document.querySelector('button[onclick*="estimateTaskDurationAI"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i>';
    lucide.createIcons();
    
    // Tyler Local rule estimation
    setTimeout(() => {
        let estimated = 15;
        const low = name.toLowerCase();
        
        if (low.includes("aspirateur") || low.includes("aspi")) estimated = 25;
        else if (low.includes("serpillière") || low.includes("laver le sol")) estimated = 30;
        else if (low.includes("vaisselle")) estimated = 15;
        else if (low.includes("vitres")) estimated = 45;
        else if (low.includes("frigo")) estimated = 20;
        else if (low.includes("poubelles") || low.includes("poubel")) estimated = 10;
        else if (low.includes("poussière") || low.includes("poussier")) estimated = 15;
        else if (low.includes("jardin") || low.includes("tondre")) estimated = 45;
        else if (low.includes("grand ménage") || low.includes("complet")) estimated = 120;
        else if (low.includes("linge") || low.includes("lessive")) estimated = 15;
        else if (low.includes("courses")) estimated = 60;
        else estimated = Math.max(10, Math.floor(Math.random() * 4 + 2) * 5); // Fallback random
        
        durationInput.value = estimated;
        showNotification(`Tyler estime cette tâche à ${estimated} min ✓`, "success");
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        lucide.createIcons();
    }, 800);
};

// Toggling de tâche checklist (fait/pas fait et fractionnement)
window.toggleTaskFait = function(taskId, dayStr) {
    const task = tasksCache.find(t => String(t.id) === String(taskId));
    if(!task) return;
    
    const weekCode = getWeekCode(window.currentCalendarMonday);
    const currentUser = (userEmail || "").trim().toLowerCase();
    
    const isRecurring = task.recurrence && task.recurrence !== 'Unique';
    
    if (isRecurring) {
        if (!task.fait_semaines) task.fait_semaines = [];
        const weekIdx = task.fait_semaines.indexOf(weekCode);
        
        if (weekIdx > -1) {
            // Décocher pour cette semaine
            task.fait_semaines.splice(weekIdx, 1);
            task.membres_qui_ont_fait = [];
            showNotification("Tâche décochée pour cette semaine ✓", "info");
        } else {
            // Cocher
            task.fait_semaines.push(weekCode);
            task.membres_qui_ont_fait = [currentUser];
            showNotification("Tâche accomplie cette semaine ✓", "success");
        }
    } else {
        // Tâche unique
        task.fait = !task.fait;
        if (task.fait) {
            task.membres_qui_ont_fait = [currentUser];
            showNotification("Tâche accomplie ✓", "success");
        } else {
            task.membres_qui_ont_fait = [];
            showNotification("Tâche décochée ✓", "info");
        }
    }
    
    localStorage.setItem('fitbuddy_tasks', JSON.stringify(tasksCache));
    
    // Sync n8n
    try {
        fetch(`${N8N_URL}/webhook/calendar-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'toggle-task', taskId: taskId, fait: task.fait, membres: task.membres_qui_ont_fait, weekCode: weekCode, email: userEmail })
        });
    } catch(e) {}
    
    window.renderCalendarEngine();
};

// 10. PUBLIC GROUP EVENTS MODAL
window.openAddEventModal = function(dayStr) {
    activeItemDayStr = dayStr;
    const modal = document.getElementById('add-event-modal');
    if (!modal) return;
    
    document.getElementById('evt-name').value = "";
    document.getElementById('evt-time').value = "19:00";
    document.getElementById('evt-location').value = "";
    document.getElementById('evt-recurrence').value = "Unique";
    
    const avatarsDiv = document.getElementById('evt-assignees-avatars');
    const groupEmails = currentGroupMembers.length > 0 
        ? currentGroupMembers.map(e => e.trim().toLowerCase())
        : [(userEmail || "").trim().toLowerCase()];
        
    avatarsDiv.innerHTML = groupEmails.map(email => `
        <div onclick="toggleAssigneeSelect('event', '${email}')" id="event-assign-${email.replace(/[^a-z0-9]/g, '-')}" class="visual-avatar-select w-9 h-9 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-transparent selected border-cyan-400 shadow-md">
            ${renderUserAvatarBadge(email, "w-full h-full")}
        </div>
    `).join('');
    
    window.selectedEventAssignees = [...groupEmails];
    
    document.getElementById('btn-save-event').onclick = function() {
        window.saveEvent();
    };
    
    modal.style.display = 'flex';
    lucide.createIcons();
};

window.closeAddEventModal = function() {
    const modal = document.getElementById('add-event-modal');
    if(modal) modal.style.display = 'none';
};

window.setEventLocation = function(loc) {
    document.getElementById('evt-location').value = loc;
};

window.saveEvent = function() {
    const name = document.getElementById('evt-name').value.trim();
    const time = document.getElementById('evt-time').value;
    const loc = document.getElementById('evt-location').value.trim();
    const recurrence = document.getElementById('evt-recurrence').value;
    
    if(!name) {
        alert("Veuillez donner un nom à l'événement.");
        return;
    }
    
    const event = {
        id: `evt-${Date.now()}`,
        name: name,
        date: `${activeItemDayStr}T${time}:00`,
        time: time,
        localisation: loc || "À la maison",
        assignes: window.selectedEventAssignees,
        recurrence: recurrence,
        email: userEmail
    };
    
    eventsCache.push(event);
    localStorage.setItem('fitbuddy_events', JSON.stringify(eventsCache));
    
    // Sync n8n
    try {
        fetch(`${N8N_URL}/webhook/calendar-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create-event', event: event, email: userEmail })
        });
    } catch(e) {}
    
    showNotification("Événement public créé ✓", "success");
    closeAddEventModal();
    window.renderCalendarEngine();
};

// 11. SUPPRESSION D'ÉLÉMENT DU CALENDRIER
window.deleteCalendarItem = function(type, id) {
    if(!confirm("Voulez-vous vraiment supprimer cet élément ?")) return;
    
    if (type === 'appt') {
        appointmentsCache = appointmentsCache.filter(item => String(item.id) !== String(id));
        localStorage.setItem('fitbuddy_appointments', JSON.stringify(appointmentsCache));
    } else if (type === 'task') {
        tasksCache = tasksCache.filter(item => String(item.id) !== String(id));
        localStorage.setItem('fitbuddy_tasks', JSON.stringify(tasksCache));
    } else if (type === 'event') {
        eventsCache = eventsCache.filter(item => String(item.id) !== String(id));
        localStorage.setItem('fitbuddy_events', JSON.stringify(eventsCache));
    }
    
    // Sync n8n
    try {
        fetch(`${N8N_URL}/webhook/calendar-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete-item', type: type, id: id, email: userEmail })
        });
    } catch(e) {}
    
    showNotification("Élément supprimé ✓", "info");
    window.renderCalendarEngine();
};

// 12. MENAGE PLAN GENERATOR SYSTEM (WIZARD & ALGORITHM)
let wizardActiveStep = 1;
let generatedCleaningTasks = [];

window.openGenerateOptions = function() {
    const modal = document.getElementById('generate-options-modal');
    if(modal) modal.style.display = 'flex';
};

window.closeGenerateOptions = function() {
    const modal = document.getElementById('generate-options-modal');
    if(modal) modal.style.display = 'none';
};

window.startCleaningWizard = function() {
    closeGenerateOptions();
    
    const modal = document.getElementById('cleaning-wizard-modal');
    if (!modal) return;
    
    // Initialiser les étapes
    wizardActiveStep = 1;
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById('wizard-step-1').classList.add('active');
    
    document.querySelectorAll('.wizard-indicator').forEach(el => el.classList.remove('active'));
    document.getElementById('wizard-ind-1').classList.add('active');
    
    document.getElementById('wizard-btn-prev').style.display = 'none';
    document.getElementById('wizard-btn-next').style.display = 'flex';
    document.getElementById('wizard-btn-next').innerHTML = 'Suivant <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>';
    document.getElementById('wizard-btn-confirm').style.display = 'none';
    
    // Nombre d'habitants par défaut
    const groupEmails = currentGroupMembers.length > 0 ? currentGroupMembers : [userEmail];
    document.getElementById('clean-house-residents').value = groupEmails.length;
    
    // Remplir les pièces de logement par défaut
    const roomsList = document.getElementById('clean-rooms-list');
    roomsList.innerHTML = "";
    
    const defaultRooms = [
        { name: "Salon", size: 25 },
        { name: "Cuisine", size: 12 },
        { name: "Salle de bain", size: 8 },
        { name: "Chambre principale", size: 14 },
        { name: "Couloir & Entrée", size: 6 }
    ];
    
    defaultRooms.forEach(r => addRoomRow(r.name, r.size));
    
    modal.style.display = 'flex';
    lucide.createIcons();
};

window.closeCleaningWizard = function() {
    const modal = document.getElementById('cleaning-wizard-modal');
    if(modal) modal.style.display = 'none';
};

window.addRoomRow = function(name = "", size = 10) {
    const container = document.getElementById('clean-rooms-list');
    const idx = container.querySelectorAll('.room-row-item').length + 1;
    
    const div = document.createElement('div');
    div.className = "room-row-item flex items-center gap-2 bg-white/[0.02] border border-white/5 p-2 rounded-xl";
    div.innerHTML = `
        <input type="text" placeholder="Nom pièce (ex: Salon)" class="room-name flex-[2] bg-transparent text-xs text-white outline-none font-bold uppercase" value="${name}">
        <div class="flex items-center gap-1.5 flex-1">
            <input type="number" class="room-size w-full bg-white/5 border border-white/10 rounded-lg p-1.5 text-xs text-center text-white outline-none focus:border-purple-500 font-bold" value="${size}">
            <span class="text-[8px] font-bold text-white/30">m²</span>
        </div>
        <button onclick="this.parentElement.remove()" class="text-red-500/50 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    `;
    
    container.appendChild(div);
    lucide.createIcons();
};

window.navigateWizard = function(stepChange) {
    const nextStep = wizardActiveStep + stepChange;
    if (nextStep < 1 || nextStep > 4) return;
    
    // Si passage à l'étape 2, pré-remplir la grille des préférences d'assignation
    if (nextStep === 2 && wizardActiveStep === 1) {
        const grid = document.getElementById('clean-preferences-grid');
        grid.innerHTML = "";
        
        const groupEmails = currentGroupMembers.length > 0 ? currentGroupMembers : [userEmail];
        const taskTypes = ["Aspirateur", "Serpillière", "Poussière", "Nettoyage sanitaires", "Sortir poubelles"];
        
        taskTypes.forEach(task => {
            let rowHtml = `
            <div class="bg-white/5 border border-white/10 p-3.5 rounded-2xl space-y-2.5">
                <span class="text-[9px] font-black text-purple-300 uppercase tracking-widest block border-b border-white/5 pb-1"><i data-lucide="shield-alert" class="w-3.5 h-3.5 inline mr-1 text-purple-400"></i> ${task}</span>
                <div class="space-y-2">`;
                
                groupEmails.forEach(email => {
                    const cleanEmail = email.trim();
                    rowHtml += `
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            ${renderUserAvatarBadge(cleanEmail, "w-6 h-6")}
                            <span class="text-[9px] font-bold text-white/70 truncate w-32 uppercase">${cleanEmail.split('@')[0]}</span>
                        </div>
                        <select class="pref-selector custom-select !p-1.5 !text-[10px] bg-white/5 text-purple-400 font-bold outline-none" data-user="${cleanEmail}" data-task="${task}">
                            <option value="1.0" class="bg-[#111]">Parfois (Standard)</option>
                            <option value="1.5" class="bg-[#111]">Toujours</option>
                            <option value="1.2" class="bg-[#111]">Souvent</option>
                            <option value="0.5" class="bg-[#111]">Rarement</option>
                            <option value="0.0" class="bg-[#111]">Jamais</option>
                        </select>
                    </div>`;
                });
                
            rowHtml += `</div></div>`;
            grid.innerHTML += rowHtml;
        });
        lucide.createIcons();
    }
    
    // Si passage à l'étape 4, exécuter l'attribution et estimation automatique des corvées par l'algorithme
    if (nextStep === 4 && wizardActiveStep === 3) {
        window.generateCleaningPlan();
    }
    
    // Activer l'étape visuelle
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
    document.getElementById(`wizard-step-${nextStep}`).classList.add('active');
    
    document.querySelectorAll('.wizard-indicator').forEach(el => el.classList.remove('active'));
    document.getElementById(`wizard-ind-${nextStep}`).classList.add('active');
    
    wizardActiveStep = nextStep;
    
    // Mettre à jour les boutons du footer
    if (wizardActiveStep === 1) {
        document.getElementById('wizard-btn-prev').style.display = 'none';
    } else {
        document.getElementById('wizard-btn-prev').style.display = 'flex';
    }
    
    if (wizardActiveStep === 4) {
        document.getElementById('wizard-btn-next').style.display = 'none';
        document.getElementById('wizard-btn-confirm').style.display = 'flex';
    } else {
        document.getElementById('wizard-btn-next').style.display = 'flex';
        document.getElementById('wizard-btn-next').innerHTML = 'Suivant <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>';
        document.getElementById('wizard-btn-confirm').style.display = 'none';
    }
};

window.generateCleaningPlan = function() {
    const sizeM2 = parseFloat(document.getElementById('clean-house-size').value) || 70;
    const keepTogether = document.getElementById('clean-keep-together').checked;
    
    // Récupérer la liste des pièces
    const rooms = [];
    document.querySelectorAll('#clean-rooms-list .room-row-item').forEach(el => {
        const name = el.querySelector('.room-name').value.trim();
        const size = parseFloat(el.querySelector('.room-size').value) || 10;
        if(name) rooms.push({ name: name, size: size });
    });
    
    // Pièces spéciales
    const specialRooms = [];
    if (document.getElementById('spec-garden').checked) specialRooms.push({ name: "Jardin (Tondre / Arroser)", size: 50, type: 'jardin' });
    if (document.getElementById('spec-terrace').checked) specialRooms.push({ name: "Terrasse", size: 20, type: 'terrasse' });
    if (document.getElementById('spec-balcony').checked) specialRooms.push({ name: "Balcon", size: 10, type: 'balcon' });
    if (document.getElementById('spec-cellar').checked) specialRooms.push({ name: "Cave", size: 15, type: 'cave' });
    if (document.getElementById('spec-attic').checked) specialRooms.push({ name: "Grenier", size: 15, type: 'grenier' });
    
    // Récupérer la matrice des préférences
    const prefs = {};
    document.querySelectorAll('.pref-selector').forEach(el => {
        const user = el.dataset.user;
        const task = el.dataset.task;
        const val = parseFloat(el.value);
        if (!prefs[user]) prefs[user] = {};
        prefs[user][task] = val;
    });
    
    const groupEmails = currentGroupMembers.length > 0 ? currentGroupMembers : [userEmail];
    
    // Moteur d'estimation de temps par corvée
    const proposedTasks = [];
    
    // A. Aspirateur dans chaque pièce
    rooms.forEach(room => {
        const tTime = Math.max(5, Math.round(room.size * 0.7)); // 0.7 min par m2
        proposedTasks.push({
            name: `Aspirateur : ${room.name}`,
            duree: tTime,
            category: "Aspirateur",
            roomName: room.name
        });
    });
    
    // B. Serpillière (Cuisine, Salle de bain et Salon)
    rooms.forEach(room => {
        const norm = room.name.toLowerCase();
        if (norm.includes("cuisine") || norm.includes("bain") || norm.includes("salon")) {
            const tTime = Math.max(5, Math.round(room.size * 0.9)); // 0.9 min par m2
            proposedTasks.push({
                name: `Serpillière : ${room.name}`,
                duree: tTime,
                category: "Serpillière",
                roomName: room.name
            });
        }
    });

    // C. Poussières (Toutes pièces hors sanitaires)
    rooms.forEach(room => {
        const norm = room.name.toLowerCase();
        if (!norm.includes("bain")) {
            const tTime = Math.max(5, Math.round(room.size * 0.4)); // 0.4 min par m2
            proposedTasks.push({
                name: `Poussières & Meubles : ${room.name}`,
                duree: tTime,
                category: "Poussière",
                roomName: room.name
            });
        }
    });

    // D. Sanitaires
    rooms.forEach(room => {
        const norm = room.name.toLowerCase();
        if (norm.includes("bain") || norm.includes("wc") || norm.includes("toilette")) {
            proposedTasks.push({
                name: `Désinfecter sanitaires & douche : ${room.name}`,
                duree: 25,
                category: "Nettoyage sanitaires",
                roomName: room.name
            });
        }
    });

    // E. Poubelles
    proposedTasks.push({
        name: "Sortir les poubelles & Tri sélectif",
        duree: 10,
        category: "Sortir poubelles",
        roomName: "Global"
    });

    // F. Pièces spéciales
    specialRooms.forEach(spec => {
        proposedTasks.push({
            name: `Ménage extérieur : ${spec.name}`,
            duree: spec.type === 'jardin' ? 40 : spec.type === 'cave' ? 30 : 20,
            category: "Poussière",
            roomName: spec.name
        });
    });

    // ALGORITHME D'ATTRIBUTION EQUITABLE PONDEREE
    // Initialisation des structures de charge par membre
    const memberLoads = {};
    groupEmails.forEach(email => {
        memberLoads[email] = { totalTime: 0, tasks: [] };
    });

    // Option Regroupement "keepTogether" : Trier les tâches de manière à grouper par pièce d'abord ou par catégorie
    if (keepTogether) {
        // Regrouper par catégorie (ex: Aspirateur) pour attribuer la même catégorie de pièce au même membre
        const categoriesMap = {};
        proposedTasks.forEach(task => {
            if(!categoriesMap[task.category]) categoriesMap[task.category] = [];
            categoriesMap[task.category].push(task);
        });

        Object.keys(categoriesMap).forEach(cat => {
            const tasksList = categoriesMap[cat];
            
            // Trouver le membre ayant le meilleur score d'affinité globale pour cette catégorie
            let bestMember = groupEmails[0];
            let bestScore = -1;
            
            groupEmails.forEach(email => {
                const prefScore = prefs[email] && prefs[email][cat] !== undefined ? prefs[email][cat] : 1.0;
                // Pondération par la charge actuelle pour éviter que la même personne fasse tout
                const loadFactor = memberLoads[email].totalTime > 0 ? (100 / memberLoads[email].totalTime) : 10;
                const score = prefScore * loadFactor;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMember = email;
                }
            });

            // Assigner toutes les pièces de cette catégorie à la même personne
            tasksList.forEach(task => {
                memberLoads[bestMember].tasks.push(task);
                memberLoads[bestMember].totalTime += task.duree;
            });
        });
    } else {
        // Répartition pièce par pièce classique (Glouton pondéré)
        // Trier les tâches par durée décroissante pour optimiser la répartition
        proposedTasks.sort((a,b) => b.duree - a.duree);

        proposedTasks.forEach(task => {
            let bestMember = groupEmails[0];
            let minScore = Infinity;

            groupEmails.forEach(email => {
                const prefScore = prefs[email] && prefs[email][task.category] !== undefined ? prefs[email][task.category] : 1.0;
                
                // Si la préférence est à "Jamais" (0.0), donner une pénalité insurmontable
                if (prefScore === 0.0) return; 

                // Le score calcule la charge de travail future divisée par le coefficient d'affinité
                const projectedLoad = (memberLoads[email].totalTime + task.duree) / prefScore;
                
                if (projectedLoad < minScore) {
                    minScore = projectedLoad;
                    bestMember = email;
                }
            });

            memberLoads[bestMember].tasks.push(task);
            memberLoads[bestMember].totalTime += task.duree;
        });
    }

    // Compiler les tâches finales générées
    generatedCleaningTasks = [];
    const joursMénage = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    
    let taskIdx = 0;
    Object.keys(memberLoads).forEach(email => {
        const record = memberLoads[email];
        record.tasks.forEach(t => {
            // Assigner un jour de manière tournante pour équilibrer la checklist
            const assignedDay = joursMénage[taskIdx % joursMénage.length];
            taskIdx++;

            const currentDayDate = getDayDate(window.currentCalendarMonday, joursMénage.indexOf(assignedDay));
            const dayStr = currentDayDate.toISOString().substring(0, 10);

            generatedCleaningTasks.push({
                id: `gen-clean-${Date.now()}-${taskIdx}`,
                name: `🧹 ${t.name}`,
                date: dayStr,
                duree: t.duree,
                fait: false,
                assignes: [email],
                recurrence: 'Unique',
                membres_qui_ont_fait: []
            });
        });
    });

    // ─── RENDU VISUEL DES RESULTATS (Étape 4) ───────────────────────────
    document.getElementById('clean-res-count').innerText = generatedCleaningTasks.length;
    
    const totalTime = generatedCleaningTasks.reduce((acc, t) => acc + t.duree, 0);
    document.getElementById('clean-res-duration').innerText = `${totalTime} min`;
    
    // Rendre les barres d'allocation
    const allocDiv = document.getElementById('clean-res-allocations');
    allocDiv.innerHTML = "";
    
    Object.keys(memberLoads).forEach(email => {
        const time = memberLoads[email].totalTime;
        const percent = totalTime > 0 ? Math.round((time / totalTime) * 100) : 0;
        
        allocDiv.innerHTML += `
        <div class="space-y-1">
            <div class="flex justify-between items-center text-[9px] font-bold uppercase">
                <div class="flex items-center gap-1.5">
                    ${renderUserAvatarBadge(email, "w-4.5 h-4.5")}
                    <span class="text-white/70">${email.split('@')[0]}</span>
                </div>
                <span class="text-purple-400 font-mono">${time} min (${percent}%)</span>
            </div>
            <div class="progress-track !h-2.5">
                <div class="progress-fill !h-full" style="width: ${percent}%; background: linear-gradient(90deg, #a855f7, #6366f1)"></div>
            </div>
        </div>`;
    });

    // Rendre la liste des tâches
    const listDiv = document.getElementById('clean-res-tasks-list');
    listDiv.innerHTML = generatedCleaningTasks.map(t => {
        const dayIdx = new Date(t.date).getDay();
        const cleanDayStr = joursMénage[dayIdx === 0 ? 6 : dayIdx - 1];
        
        return `
        <div class="flex justify-between items-center bg-white/[0.02] border border-white/5 p-2 rounded-xl text-[9px]">
            <div>
                <p class="font-bold text-white uppercase">${t.name}</p>
                <p class="text-white/30 font-bold uppercase mt-0.5">${cleanDayStr} • ⏱️ ${t.duree} min</p>
            </div>
            ${renderUserAvatarBadge(t.assignes[0], "w-5 h-5")}
        </div>`;
    }).join('');
};

window.applyGeneratedCleaningPlan = function() {
    if (generatedCleaningTasks.length === 0) return;
    
    tasksCache = [...tasksCache, ...generatedCleaningTasks];
    localStorage.setItem('fitbuddy_tasks', JSON.stringify(tasksCache));
    
    // Sync n8n en lot
    try {
        fetch(`${N8N_URL}/webhook/calendar-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create-tasks-batch', tasks: generatedCleaningTasks, email: userEmail })
        });
    } catch(e) {}
    
    showNotification(`${generatedCleaningTasks.length} tâches de ménage injectées ✓`, "success");
    closeCleaningWizard();
    window.renderCalendarEngine();
};

