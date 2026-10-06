export function mSendMessage(vendetta) {
        const {
                metro: {
                        findByProps,
                        findByStoreName,
                        common: {
                                lodash: { merge },
                        },
                },
        } = vendetta;
        const Send = findByProps("_sendMessage");
        const { createBotMessage } = findByProps("createBotMessage");
        const Avatars = findByProps("BOT_AVATARS");
        const { getChannelId: getFocusedChannelId } = findByStoreName("SelectedChannelStore");
        return function (message, mod) {
                message.channelId ??= getFocusedChannelId();
                if ([null, undefined].includes(message.channelId)) throw new Error("No channel id to receive the message into (channelId)");
                let msg = message;
                if (message.really) {
                        if (typeof mod === "object") msg = merge(msg, mod);
                        const args = [msg, {}];
                        args[0].tts ??= false;
                        for (const key of ["allowedMentions", "messageReference"]) {
                                if (key in args[0]) {
                                        args[1][key] = args[0][key];
                                        delete args[0][key];
                                }
                        }
                        const overwriteKey = "overwriteSendMessageArg2"
                        if (overwriteKey in args[0]) {
                                // so that you can use the keys i may have missed in the for loop above
                                args[1] = args[0][overwriteKey];
                                delete args[0][overwriteKey];
                        }
                        return Send._sendMessage(message.channelId, ...args);
                }
                if (mod !== true) msg = createBotMessage(msg);
                if (typeof mod === "object") {
                        msg = merge(msg, mod);
                        if (typeof mod.author === "object")
                                (function processAvatarURL() {
                                        const author = mod.author;
                                        if (typeof author.avatarURL === "string") {
                                                Avatars.BOT_AVATARS[author.avatar ?? author.avatarURL] = author.avatarURL;
                                                author.avatar ??= author.avatarURL
                                                delete author.avatarURL;
                                        }
                                })();
                }
                Send.receiveMessage(msg.channel_id, msg);
                return msg;
        };
}

export function cmdDisplays(obj, translations, locale) {
        if (!obj?.name || !obj?.description) throw new Error(`No name(${obj?.name}) or description(${obj?.description}) in the passed command (command name: ${obj?.name})`);

        obj.displayName ??= translations?.names?.[locale] ?? obj.name;
        obj.displayDescription ??= translations?.names?.[locale] ?? obj.description;
        if (obj.options) {
                if (!Array.isArray(obj.options)) throw new Error(`Options is not an array (received: ${typeof obj.options})`);
                for (let optionIndex = 0; optionIndex < obj.options.length; optionIndex++) {
                        const option = obj.options[optionIndex];
                        // TODO: Handle subcommands (type 1 or 2 probably i forgor)
                        if (!option?.name || !option?.description) throw new Error(`No name(${option?.name}) or description(${option?.description} in the option with index ${optionIndex}`);
                        option.displayName ??= translations?.options?.[optionIndex]?.names?.[locale] ?? option.name;
                        option.displayDescription ??= translations?.options?.[optionIndex]?.descriptions?.[locale] ?? option.description;
                        if (option?.choices) {
                                if (!Array.isArray(option?.choices)) throw new Error(`Choices is not an array (received: ${typeof option.choices})`);
                                for (let choiceIndex = 0; choiceIndex < option.choices.length; choiceIndex++) {
                                        const choice = option.choices[choiceIndex];
                                        if (!choice?.name) throw new Error(`No name of choice with index ${choiceIndex} in option with index ${optionIndex}`);
                                        choice.displayName ??= translations?.options?.[optionIndex]?.choices?.[choiceIndex]?.names?.[locale] ?? choice.name;
                                }
                        }
                }
        }
        return obj;
}

export const AVATARS = { command: "https://cdn.discordapp.com/attachments/1099116247364407337/1112129955053187203/command.png" };
