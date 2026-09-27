const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Database = require("better-sqlite3");
const http = require("http");
const cron = require("node-cron");
require("dotenv").config();

const db = new Database("strikes.db");

// Tabla para strikes
db.prepare(`
    CREATE TABLE IF NOT EXISTS strikes (
        user_id TEXT,
        guild_id TEXT,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, guild_id)
    )
`).run();

// Tablas detalladas para registros semanales con timestamp
db.prepare(`
    CREATE TABLE IF NOT EXISTS mutes_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        staff_id TEXT,
        user_name TEXT,
        timestamp INTEGER
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS txt_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        staff_id TEXT,
        nick TEXT,
        timestamp INTEGER
    )
`).run();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

const CANAL_MUTES_ID = "1470493684956135627";
const CANAL_TXT_ID = "1470494074594132194";
const CANAL_EVIDENCIA_ID = "1470521521872310384";
const CANAL_INACTIVIDAD_ID = "1470490696975651004";
const CANAL_VERIFICACION_ID = "1541844943008440410";
const CANAL_AVISO_X2_ID = "1470502486602154028"; // 📌 Canal para el aviso de X2 de evidencias

// 📌 Canales para el mensaje automático de reinicio semanal
const CANALES_REINICIO_IDS = [
    "1470493684956135627",
    "1470494074594132194"
];

const ROL_ADMIN_COMANDOS_ID = "1470495717494620307";

client.once("ready", async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);

    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);

        await guild.commands.set([
            {
                name: "mute",
                description: "Registra un mute de voz o texto",
                options: [
                    { name: "usuario", description: "Escribe el nombre o ID del usuario sancionado", type: 3, required: true },
                    { name: "staff", description: "El miembro del Staff que aplica el mute", type: 6, required: true },
                    { name: "tiempo", description: "Tiempo de duración (ej: 3h)", type: 3, required: true },
                    { name: "motivo", description: "Motivo de la sanción", type: 3, required: true },
                    { name: "pruebas", description: "Sube una imagen o archivo de prueba", type: 11, required: true }
                ]
            },
            {
                name: "txt",
                description: "Registra una textura o mod no permitido",
                options: [
                    { name: "nick", description: "El nick del usuario", type: 3, required: true },
                    { name: "textura_mod", description: "Especifica la textura o el mod", type: 3, required: true },
                    { name: "pruebas", description: "Sube una imagen o archivo de prueba", type: 11, required: true }
                ]
            },
            {
                name: "verificación",
                description: "Registra la verificación de un nuevo miembro del staff y le asigna roles",
                options: [
                    { name: "usuario_discord", description: "El usuario de Discord a quien se le asignarán los roles", type: 6, required: true },
                    { name: "nick", description: "Nick del usuario verificado", type: 3, required: true },
                    { name: "rango", description: "Rango asignado", type: 3, required: true },
                    { name: "ingresado_por", description: "Persona que lo ingresó (menciona al usuario)", type: 6, required: true }
                ]
            },
            {
                name: "inactividad",
                description: "Registra una solicitud de inactividad de un staff",
                options: [
                    { name: "usuario", description: "El usuario staff que solicita la inactividad", type: 6, required: true },
                    { name: "rango", description: "Rango del usuario", type: 3, required: true },
                    { name: "fecha_inicio", description: "Fecha de inicio (ej: 20/05/2026)", type: 3, required: true },
                    { name: "fecha_regreso", description: "Fecha de regreso (ej: 27/05/2026)", type: 3, required: true },
                    { name: "motivo", description: "Motivo de la inactividad", type: 3, required: true }
                ]
            },
            {
                name: "top",
                description: "Muestra el top 3 mejores staffs de la semana",
            },
            {
                name: "reinicio",
                description: "Reinicia el top semanal borrando los registros actuales",
            },
            {
                name: "strike",
                description: "Registra una sanción para el equipo de Staff",
                options: [
                    { name: "staff", description: "El miembro del Staff sancionado", type: 6, required: true },
                    {
                        name: "categoria", description: "Selecciona la categoría de la sanción", type: 3, required: true,
                        choices: [
                            { name: "🟢 LEVE", value: "🟢 LEVE" },
                            { name: "🔴 GRAVE", value: "🔴 GRAVE" }
                        ]
                    },
                    {
                        name: "accion", description: "Selecciona la acción aplicada", type: 3, required: true,
                        choices: [
                            { name: "Warn 1", value: "Warn 1" },
                            { name: "Warn 2", value: "Warn 2" },
                            { name: "Strike 1", value: "Strike 1" },
                            { name: "Strike 2", value: "Strike 2" },
                            { name: "Strike 3", value: "Strike 3" }
                        ]
                    },
                    {
                        name: "rango", description: "Selecciona el rango del sancionado", type: 3, required: true,
                        choices: [
                            { name: "JrHelper", value: "JrHelper" },
                            { name: "SrHelper", value: "SrHelper" },
                            { name: "JrSoporte", value: "JrSoporte" },
                            { name: "SrSoporte", value: "SrSoporte" },
                            { name: "JrMod", value: "JrMod" },
                            { name: "Mod", value: "Mod" },
                            { name: "Mod+", value: "Mod+" },
                            { name: "JrAdmin", value: "JrAdmin" },
                            { name: "Admin", value: "Admin" },
                            { name: "SrAdmin", value: "SrAdmin" }
                        ]
                    },
                    { name: "motivo", description: "Escribe el motivo de la sanción", type: 3, required: true }
                ]
            },
            {
                name: "promote",
                description: "Registra un ascenso o cambio de rango",
                options: [
                    { name: "staff", description: "Staff promovido", type: 6, required: true },
                    { name: "accion", description: "Acción", type: 3, required: true, choices: [{ name: "Promote", value: "Promote" }] },
                    { name: "rango_antiguo", description: "Rango anterior", type: 3, required: true },
                    { name: "rango_nuevo", description: "Nuevo rango", type: 3, required: true },
                    { name: "motivo", description: "Motivo", type: 3, required: true }
                ]
            },
            {
                name: "demote",
                description: "Registra un descenso de rango",
                options: [
                    { name: "staff", description: "Staff degradado", type: 6, required: true },
                    { name: "accion", description: "Acción", type: 3, required: true, choices: [{ name: "Demote", value: "Demote" }] },
                    { name: "rango_antiguo", description: "Rango anterior", type: 3, required: true },
                    { name: "rango_nuevo", description: "Nuevo rango", type: 3, required: true },
                    { name: "motivo", description: "Motivo", type: 3, required: true }
                ]
            }
        ]);

        console.log("✅ Comandos registrados correctamente.");

        // 📌 TAREA PROGRAMADA 1: Reinicio semanal (Viernes a las 21:00)
        cron.schedule("00 21 * * 5", async () => {
            try {
                db.prepare("DELETE FROM mutes_log WHERE guild_id = ?").run(guild.id);
                db.prepare("DELETE FROM txt_log WHERE guild_id = ?").run(guild.id);
                console.log("🔄 Base de datos reiniciada automáticamente por el cron job.");

                const mensajeReinicio = 
`╔═════════════════════════════╗
✨ **¡REINICIO SEMANAL DE ACTIVIDAD!** ✨
╚═════════════════════════════╝
El contador se ha puesto a **cero**. 
¡Gracias por su increíble esfuerzo esta semana! 

> 📊 *Estado: Reiniciado con éxito*`;

                for (const canalId of CANALES_REINICIO_IDS) {
                    const canal = guild.channels.cache.get(canalId);
                    if (canal) {
                        await canal.send({ content: mensajeReinicio });
                    } else {
                        console.warn(`⚠️ No se pudo encontrar el canal con ID ${canalId} para el reinicio semanal.`);
                    }
                }
            } catch (cronError) {
                console.error("❌ Error al ejecutar la tarea programada de reinicio semanal:", cronError);
            }
        }, {
            scheduled: true,
            timezone: "Europe/Madrid"
        });

        // 📌 TAREA PROGRAMADA 2: Aviso previo de X2 de Evidencias (Domingos a las 20:30)
        cron.schedule("00 21 * * 0", async () => {
            try {
                const canalEvidencias = guild.channels.cache.get(CANAL_AVISO_X2_ID);
                if (canalEvidencias) {
                    const mensajeX2Previo = 
`📢 ¡ATENCIÓN COMUNIDAD! 📢
━━━━━━━━━━━━━━━━━━━━
✨ X2 DE EVIDENCIAS ✨
⏳ Se hará en 30 mins.
¡Estén atentos y prepárense! 🚀
¡Es para animarlos y ayudarlos en las evidencias!
<@&1470499663038779714>`;

                    await canalEvidencias.send({ content: mensajeX2Previo });
                    console.log("📢 Mensaje automático previo de X2 de evidencias enviado correctamente.");
                } else {
                    console.warn(`⚠️ No se pudo encontrar el canal con ID ${CANAL_AVISO_X2_ID} para el aviso previo de X2.`);
                }
            } catch (cronError) {
                console.error("❌ Error al ejecutar la tarea programada del aviso previo de X2:", cronError);
            }
        }, {
            scheduled: true,
            timezone: "Europe/Madrid"
        });

        // 📌 TAREA PROGRAMADA 3: Mensaje oficial de inicio de X2 de Evidencias (Domingos a las 20:38)
        cron.schedule("30 21 * * 0", async () => {
            try {
                const canalEvidencias = guild.channels.cache.get(CANAL_AVISO_X2_ID);
                if (canalEvidencias) {
                    const mensajeX2Oficial = 
`🚨 ATENCIÓN STAFF 🚨
¡Ha comenzado el x2 de evidencias! 📈✨ Por favor, manténganse activos y atentos a los reportes. ¡A trabajar! 👮‍♂️🔥

¡Vamos chavales ustedes pueden!
<@&1470499663038779714>`;

                    await canalEvidencias.send({ content: mensajeX2Oficial });
                    console.log("🚨 Mensaje oficial de inicio de X2 de evidencias enviado correctamente a las 20:38.");
                } else {
                    console.warn(`⚠️ No se pudo encontrar el canal con ID ${CANAL_AVISO_X2_ID} para el inicio de X2.`);
                }
            } catch (cronError) {
                console.error("❌ Error al ejecutar la tarea programada del inicio de X2 de evidencias:", cronError);
            }
        }, {
            scheduled: true,
            timezone: "Europe/Madrid"
        });

        // 📌 TAREA PROGRAMADA 4: Mensaje de fin de X2 de Evidencias (Domingos a las 20:41)
        cron.schedule("00 22 * * 0", async () => {
            try {
                const canalEvidencias = guild.channels.cache.get(CANAL_AVISO_X2_ID);
                if (canalEvidencias) {
                    const mensajeX2Fin = 
`Les informamos que el x2 de evidencias ha llegado a su fin. 🛑✨
Muchas gracias a todos por su esfuerzo y dedicación durante este tiempo. 💪💼
<@&1470499663038779714>`;

                    await canalEvidencias.send({ content: mensajeX2Fin });
                    console.log("🛑 Mensaje de fin de X2 de evidencias enviado correctamente a las 20:41.");
                } else {
                    console.warn(`⚠️ No se pudo encontrar el canal con ID ${CANAL_AVISO_X2_ID} para el fin de X2.`);
                }
            } catch (cronError) {
                console.error("❌ Error al ejecutar la tarea programada del fin de X2 de evidencias:", cronError);
            }
        }, {
            scheduled: true,
            timezone: "Europe/Madrid"
        });

    } catch (error) {
        console.error("❌ Error registrando los comandos:", error);
    }
});

client.on("interactionCreate", async (interaction) => {
    // --- MANEJO DE BOTONES DE INACTIVIDAD ---
    if (interaction.isButton()) {
        if (interaction.customId === "aceptar_inactividad" || interaction.customId === "rechazar_inactividad") {
            // Verificar si el usuario tiene permiso (rol de admin/staff)
            if (!interaction.member.roles.cache.has(ROL_ADMIN_COMANDOS_ID)) {
                return interaction.reply({
                    content: "❌ No tienes permisos para gestionar las solicitudes de inactividad.",
                    ephemeral: true
                });
            }

            const embedOriginal = interaction.message.embeds[0];
            if (!embedOriginal) return;

            const esAceptado = interaction.customId === "aceptar_inactividad";
            const nuevoEmbed = EmbedBuilder.from(embedOriginal);

            // Modificar los campos del embed
            const camposActualizados = embedOriginal.fields.map(field => {
                if (field.name === "Estado") {
                    return {
                        name: "Estado",
                        value: esAceptado 
                            ? `✅ **Aceptada por** <@${interaction.user.id}>` 
                            : `❌ **Rechazada por** <@${interaction.user.id}>`,
                        inline: false
                    };
                }
                return field;
            });

            nuevoEmbed.setFields(camposActualizados);
            if (!esAceptado) {
                nuevoEmbed.setColor(0xED4245); // Cambiar a rojo si es rechazada
            }

            // Actualizar el mensaje quitando los botones
            await interaction.update({
                embeds: [nuevoEmbed],
                components: []
            });
            return;
        }
    }

    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild) return;

    // --- COMANDO /MUTE ---
    if (interaction.commandName === "mute") {
        await interaction.deferReply({ ephemeral: true });

        const usuarioTexto = interaction.options.getString("usuario"); 
        const staff = interaction.options.getUser("staff"); 
        const tiempo = interaction.options.getString("tiempo");
        const motivo = interaction.options.getString("motivo");
        const archivoPrueba = interaction.options.getAttachment("pruebas");

        db.prepare(`
            INSERT INTO mutes_log (guild_id, staff_id, user_name, timestamp) 
            VALUES (?, ?, ?, ?)
        `).run(interaction.guild.id, staff.id, usuarioTexto, Math.floor(Date.now() / 1000));

        const registroTotal = db.prepare("SELECT count(*) as total FROM mutes_log WHERE user_name = ? AND guild_id = ?")
            .get(usuarioTexto, interaction.guild.id);
        const totalMutes = registroTotal ? registroTotal.total : 1;

        const fechaActual = new Date().toLocaleString("es-ES", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });

        const embedMute = new EmbedBuilder()
            .setColor(0xF37A24)
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTitle("🔇 MUTE REGISTRADO")
            .addFields(
                { name: "Staff", value: `<@${staff.id}>`, inline: false },
                { name: "Usuario Sancionado", value: `${usuarioTexto}`, inline: true },
                { name: "Duracion", value: `${tiempo}`, inline: true },
                { name: "Total Mutes", value: `${totalMutes}`, inline: true },
                { name: "Motivo", value: `${motivo}`, inline: false },
                { name: "Prueba", value: `[Ver archivo adjunto](${archivoPrueba.url})`, inline: false }
            )
            .setImage(archivoPrueba.url)
            .setFooter({ text: `Registrado en el sistema • ${fechaActual}` });

        const canalDestino = interaction.guild.channels.cache.get(CANAL_MUTES_ID) || interaction.channel;
        await canalDestino.send({ embeds: [embedMute] });

        await interaction.editReply({
            content: `✅ Mute registrado correctamente para **${usuarioTexto}**.`
        });
        return;
    }

    // --- COMANDO /TXT ---
    if (interaction.commandName === "txt") {
        if (interaction.channelId !== CANAL_TXT_ID) {
            return interaction.reply({
                content: `❌ Este comando solo se puede usar en el canal <#${CANAL_TXT_ID}>.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const nick = interaction.options.getString("nick");
        const texturaMod = interaction.options.getString("textura_mod");
        const archivoPrueba = interaction.options.getAttachment("pruebas");

        db.prepare(`
            INSERT INTO txt_log (guild_id, staff_id, nick, timestamp) 
            VALUES (?, ?, ?, ?)
        `).run(interaction.guild.id, interaction.user.id, nick, Math.floor(Date.now() / 1000));

        const registroTotalTxt = db.prepare("SELECT count(*) as total FROM txt_log WHERE nick = ? AND guild_id = ?")
            .get(nick, interaction.guild.id);
        const totalTxt = registroTotalTxt ? registroTotalTxt.total : 1;

        const fechaActual = new Date().toLocaleString("es-ES", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });

        const embedTxt = new EmbedBuilder()
            .setColor(0x3498DB)
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTitle("📦 TEXTURA / MOD REGISTRADO")
            .addFields(
                { name: "Usuario / Nick", value: `${nick}`, inline: false },
                { name: "Textura / Mod", value: `${texturaMod}`, inline: false },
                { name: "Total Texturas/Mods", value: `${totalTxt}`, inline: true },
                { name: "Prueba", value: `[Ver archivo adjunto](${archivoPrueba.url})`, inline: false }
            )
            .setImage(archivoPrueba.url)
            .setFooter({ text: `Registrado en el sistema • ${fechaActual}` });

        await interaction.channel.send({ embeds: [embedTxt] });

        await interaction.editReply({
            content: `✅ Registro de textura/mod guardado correctamente para **${nick}**.`
        });
        return;
    }

    // --- COMANDO /VERIFICACIÓN ---
    if (interaction.commandName === "verificación") {
        await interaction.deferReply({ ephemeral: true });

        const miembro = interaction.options.getMember("usuario_discord");
        const nick = interaction.options.getString("nick");
        const rango = interaction.options.getString("rango");
        const ingresadoPor = interaction.options.getUser("ingresado_por");

        const rolesAAsignar = [
            "1470499663038779714",
            "1470499293126459413"
        ];

        try {
            await miembro.roles.add(rolesAAsignar);
        } catch (error) {
            console.error("No se pudieron asignar los roles:", error);
            return interaction.editReply({
                content: "❌ No se pudieron asignar los roles. Asegúrate de que el bot tenga el rol por encima de estos y permisos de 'Gestionar Roles'."
            });
        }

        const embedVerificacion = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle("Verificación")
            .addFields(
                { name: "Nick", value: `${nick}`, inline: false },
                { name: "Rango", value: `${rango}`, inline: false },
                { name: "Persona que le ingresó", value: `${ingresadoPor}`, inline: false }
            )
            .setTimestamp();

        const canalVerificacion = interaction.guild.channels.cache.get(CANAL_VERIFICACION_ID);

        if (!canalVerificacion) {
            return interaction.editReply({
                content: "❌ No se pudo encontrar el canal de verificación configurado."
            });
        }

        await canalVerificacion.send({ embeds: [embedVerificacion] });

        return interaction.editReply({
            content: `✅ Verificación completada y roles (<@&1470499663038779714> y <@&1470499293126459413>) asignados correctamente a ${miembro}.`
        });
    }

    // --- COMANDO /INACTIVIDAD ---
    if (interaction.commandName === "inactividad") {
        await interaction.deferReply({ ephemeral: true });

        const usuario = interaction.options.getUser("usuario");
        const rango = interaction.options.getString("rango");
        const fechaInicio = interaction.options.getString("fecha_inicio");
        const fechaRegreso = interaction.options.getString("fecha_regreso");
        const motivo = interaction.options.getString("motivo");

        const embedInactividad = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("📅 Solicitud de Inactividad")
            .addFields(
                { name: "Usuario", value: `<@${usuario.id}>`, inline: true },
                { name: "Rango", value: `${rango}`, inline: true },
                { name: "Tiempo", value: `${fechaInicio} -${fechaRegreso}`, inline: true },
                { name: "Motivo", value: `${motivo}`, inline: false },
                { name: "Estado", value: "⏳ **Pendiente de revisión**", inline: false }
            );

        const botones = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("aceptar_inactividad")
                .setLabel("Aceptar")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("rechazar_inactividad")
                .setLabel("Rechazar")
                .setStyle(ButtonStyle.Danger)
        );

        const canalInactividad = interaction.guild.channels.cache.get(CANAL_INACTIVIDAD_ID) || interaction.channel;
        await canalInactividad.send({ embeds: [embedInactividad], components: [botones] });

        return interaction.editReply({
            content: `✅ Solicitud de inactividad enviada a revisión para **${usuario.tag}**.`
        });
    }

    // --- COMANDO /TOP ---
    if (interaction.commandName === "top") {
        await interaction.deferReply();

        const hace7Dias = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

        const mutesQuery = db.prepare(`
            SELECT staff_id, COUNT(*) as mutes_count 
            FROM mutes_log 
            WHERE guild_id = ? AND timestamp >= ? 
            GROUP BY staff_id
        `).all(interaction.guild.id, hace7Dias);

        const txtQuery = db.prepare(`
            SELECT staff_id, COUNT(*) as txt_count 
            FROM txt_log 
            WHERE guild_id = ? AND timestamp >= ? 
            GROUP BY staff_id
        `).all(interaction.guild.id, hace7Dias);

        const statsMap = {};

        mutesQuery.forEach(row => {
            if (!statsMap[row.staff_id]) statsMap[row.staff_id] = { mutes: 0, txts: 0 };
            statsMap[row.staff_id].mutes = row.mutes_count;
        });

        txtQuery.forEach(row => {
            if (!statsMap[row.staff_id]) statsMap[row.staff_id] = { mutes: 0, txts: 0 };
            statsMap[row.staff_id].txts = row.txt_count;
        });

        const ranking = Object.keys(statsMap).map(staffId => {
            return {
                staffId: staffId,
                mutes: statsMap[staffId].mutes,
                txts: statsMap[staffId].txts,
                total: statsMap[staffId].mutes + statsMap[staffId].txts
            };
        }).sort((a, b) => b.total - a.total).slice(0, 3);

        let descripcionTop = "";

        if (ranking.length === 0) {
            descripcionTop = "No hay registros suficientes en los últimos 7 días.";
        } else {
            ranking.forEach((item, index) => {
                const puesto = index + 1;
                descripcionTop += `${puesto}. <@${item.staffId}> 🔇${item.mutes} 🧩${item.txts}\n`;
            });
        }

        const embedTop = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle("🏆 Top Staff — Semanal")
            .setDescription(descripcionTop)
            .setTimestamp();

        return interaction.editReply({ embeds: [embedTop] });
    }

    // --- COMANDO /REINICIO ---
    if (interaction.commandName === "reinicio") {
        if (!interaction.member.roles.cache.has(ROL_ADMIN_COMANDOS_ID)) {
            return interaction.reply({
                content: "❌ No tienes el rol necesario (<@&1470495717494620307>) para usar este comando.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        db.prepare("DELETE FROM mutes_log WHERE guild_id = ?").run(interaction.guild.id);
        db.prepare("DELETE FROM txt_log WHERE guild_id = ?").run(interaction.guild.id);

        return interaction.editReply({
            content: "🔄 ¡El top semanal ha sido reiniciado correctamente y los contadores se han puesto a cero!"
        });
    }

    // --- COMANDO /STRIKE ---
    if (interaction.commandName === "strike") {
        if (!interaction.member.roles.cache.has(ROL_ADMIN_COMANDOS_ID)) {
            return interaction.reply({
                content: "❌ No tienes el rol necesario (<@&1470495717494620307>) para usar este comando.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const staff = interaction.options.getUser("staff");
        const categoria = interaction.options.getString("categoria");
        const accion = interaction.options.getString("accion");
        const rango = interaction.options.getString("rango");
        const motivo = interaction.options.getString("motivo");

        const categoriaTextoLimpio = categoria.replace(/🟢|🟡|🔴/g, "").trim();

        let registro = db.prepare("SELECT count FROM strikes WHERE user_id = ? AND guild_id = ?")
            .get(staff.id, interaction.guild.id);

        let nuevosStrikes = (registro ? registro.count : 0) + 1;

        db.prepare(`
            INSERT INTO strikes (user_id, guild_id, count) 
            VALUES (?, ?, ?) 
            ON CONFLICT(user_id, guild_id) 
            DO UPDATE SET count = ?
        `).run(staff.id, interaction.guild.id, nuevosStrikes, nuevosStrikes);

        const mensajeSancion = 
`# ‼️ REGISTRO DE SANCIÓN: ${categoriaTextoLimpio} ‼️
---
**Staff:** [ ${staff} ]
\`──────────────────────────────\`
**\` CATEGORÍA » \`${categoria}**
**\` ACCIÓN     » \`** [ ${accion} ]
**\` RANGO      » \`** ${rango}
**\` MOTIVO     » \`** ${motivo}
\`──────────────────────────────\``;

        await interaction.channel.send({ content: mensajeSancion });

        await interaction.editReply({
            content: `✅ Sanción registrada para ${staff}.`
        });

        await staff.send({
            content: `Has recibido una sanción en **${interaction.guild.name}**.\n**Acción:** ${accion}\n**Motivo:** ${motivo}`
        }).catch(() => null);

        return;
    }

    // --- COMANDO /PROMOTE ---
    if (interaction.commandName === "promote") {
        if (!interaction.member.roles.cache.has(ROL_ADMIN_COMANDOS_ID)) {
            return interaction.reply({
                content: "❌ No tienes el rol necesario (<@&1470495717494620307>) para usar este comando.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const staff = interaction.options.getUser("staff");
        const accion = interaction.options.getString("accion");
        const rangoAntiguo = interaction.options.getString("rango_antiguo");
        const rangoNuevo = interaction.options.getString("rango_nuevo");
        const motivo = interaction.options.getString("motivo");

        const mensajePromote = 
`▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
**STAFF  »** [    < <<< <<${staff}>> >> > >  >    ]
**ACCIÓN  »** [ ${accion}]
**RANGO   »** ${rangoAntiguo} → ${rangoNuevo}
**MOTIVO  »** *${motivo}*
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`;

        await interaction.channel.send({ content: mensajePromote });

        await interaction.editReply({
            content: `✅ Registro de ascenso publicado para ${staff}.`
        });

        await staff.send({
            content: `¡Tu rango en **${interaction.guild.name}** ha cambiado!\n**Acción:** ${accion}\n**Cambio:** ${rangoAntiguo} → ${rangoNuevo}\n**Motivo:** *${motivo}*`
        }).catch(() => null);

        return;
    }

    // --- COMANDO /DEMOTE ---
    if (interaction.commandName === "demote") {
        if (!interaction.member.roles.cache.has(ROL_ADMIN_COMANDOS_ID)) {
            return interaction.reply({
                content: "❌ No tienes el rol necesario (<@&1470495717494620307>) para usar este comando.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const staff = interaction.options.getUser("staff");
        const accion = interaction.options.getString("accion");
        const rangoAntiguo = interaction.options.getString("rango_antiguo");
        const rangoNuevo = interaction.options.getString("rango_nuevo");
        const motivo = interaction.options.getString("motivo");

        const mensajeDemote = 
`▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
**STAFF  »** [    < <<< <${staff}> >> > >  >    ]
**ACCIÓN  »** [ ${accion}]
**RANGO   »** ${rangoAntiguo} → ${rangoNuevo}
**MOTIVO  »** ${motivo}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`;

        await interaction.channel.send({ content: mensajeDemote });

        await interaction.editReply({
            content: `✅ Registro de descenso publicado para ${staff}.`
        });

        await staff.send({
            content: `Tu rango en **${interaction.guild.name}** ha sido actualizado.\n**Acción:** ${accion}\n**Cambio:** ${rangoAntiguo} → ${rangoNuevo}\n**Motivo:** ${motivo}`
        }).catch(() => null);

        return;
    }
});

client.login(process.env.TOKEN);

// --- SERVIDOR HTTP PARA EL PUERTO (Requerido por Render) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot de Discord activo y funcionando correctamente.\n");
}).listen(PORT, () => {
    console.log(`🌐 Servidor HTTP escuchando en el puerto ${PORT}`);
});