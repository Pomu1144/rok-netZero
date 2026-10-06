import { assetUrl } from '../../assets';
import { sfx } from '../../audio';
import { CHAPTERS, STAGES, STAGE_BY_ID } from '../../data/campaign';
import { COMMANDERS } from '../../data/commanders';
import { TROOP_NAMES, troopIdSprite } from '../../data/troops';
import type { TroopType } from '../../data/types';
import { troopPower } from '../../game/battle';
import { STAGE_AP, autoArmy, enemyPower, fightStage, stageStars, stageUnlocked } from '../../game/campaign';
import { commanderBusy } from '../../game/logic';
import { sumTroops } from '../../game/state';
import { playBattle } from '../battleScene';
import type { UiCtx } from '../ctx';
import { onAct, openModal, rewardHtml, toast } from '../dom';
import { esc, fmt } from '../format';
import { ink } from '../ink';

const starRow = (n: number) => `<span class="cp-stars">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

export function openCampaign(ctx: UiCtx): void {
  const s0 = ctx.game.state;
  // open on the furthest unlocked stage
  let stageId = [...STAGES].reverse().find((st) => stageUnlocked(s0, st.id))?.id ?? STAGES[0].id;
  let chapter = STAGE_BY_ID[stageId].chapter;
  let cmd: string | null = null;
  openModal({
    title: 'Campaign',
    seal: '征',
    kicker: 'Chronicles of conquest',
    size: 'wide',
    live: true,
    render: (body, h) => {
      const s = ctx.game.state;
      const ch = CHAPTERS[chapter - 1];
      const stages = STAGES.filter((x) => x.chapter === chapter);
      const stage = STAGE_BY_ID[stageId];
      const idle = COMMANDERS.filter((c) => s.commanders[c.id].unlocked && !commanderBusy(s, c.id));
      if (!cmd || !idle.some((c) => c.id === cmd)) cmd = idle.sort((a, b) => s.commanders[b.id].level - s.commanders[a.id].level)[0]?.id ?? null;
      const army = cmd ? autoArmy(s, cmd) : {};
      const mine = troopPower(army);
      const theirs = enemyPower(stage);
      const ratio = mine / Math.max(1, theirs);
      const odds = ratio >= 1.6 ? ['Overwhelming', 'good'] : ratio >= 1.05 ? ['Favourable', 'good'] : ratio >= 0.75 ? ['Even', 'warn'] : ['Perilous', 'bad'];
      const unlocked = stageUnlocked(s, stage.id);
      const best = stageStars(s, stage.id);
      const chStars = stages.reduce((n, x) => n + stageStars(s, x.id), 0);
      body.innerHTML = `
        <div class="tal-tabs cp-tabs">${CHAPTERS.map((c) => `<button class="tal-tab ${c.n === chapter ? 'sel' : ''}" data-act="ch" data-n="${c.n}"><span class="seal">${c.kanji}</span>${c.n}. ${esc(c.title)}</button>`).join('')}</div>
        <div class="cp-hero" style="background-image:url(${assetUrl(ch.art)})">
          <div class="cp-htitle"><div class="kicker">Chapter ${ch.n}</div><div class="hunt-name">${esc(ch.title)}</div><div class="cp-hstars">${ink('i_star', 14, 'dark')} ${chStars} / 12 stars</div></div>
          <div class="cp-path">${stages
            .map((x, i) => {
              const open = stageUnlocked(s, x.id);
              const st = stageStars(s, x.id);
              return `${i ? '<span class="cp-link"></span>' : ''}<button class="cp-node ${x.id === stageId ? 'sel' : ''} ${open ? '' : 'locked'} ${st ? 'cleared' : ''} ${i === 3 ? 'boss' : ''}" data-act="stage" data-id="${x.id}" aria-label="${esc(x.title)}">
                ${i === 3 ? `<span class="cp-boss" style="background-image:url(${assetUrl(ch.boss)})"></span>` : `<span class="cp-num">${ch.n}-${i + 1}</span>`}
                ${open ? starRow(st) : `<span class="cp-lock">${ink('i_lock', 12)}</span>`}
              </button>`;
            })
            .join('')}</div>
        </div>
        <div class="cp-stage">
          <div class="cp-enemy ${stage.enemy.portrait.startsWith('boss_') ? 'boss' : ''}" style="background-image:url(${assetUrl(stage.enemy.portrait)})"></div>
          <div class="col" style="gap:8px;min-width:0">
            <div><div class="kicker">Stage ${stage.chapter}-${STAGES.indexOf(stage) % 4 + 1} ${best ? starRow(best) : ''}</div><div class="cmd-name" style="font-size:24px">${esc(stage.title)}</div></div>
            <p class="cp-story">${esc(stage.story)}</p>
            <div class="cp-army">${Object.entries(stage.enemy.troops)
              .map(([id, n]) => `<span class="cp-unit"><img src="${assetUrl(stage.enemy.barbarian ? 'unit_barbarian' : troopIdSprite(id))}" alt="">${fmt(n)}<small>${TROOP_NAMES[id.split('_')[0] as TroopType][Number(id.split('_')[1]) - 1]}</small></span>`)
              .join('')}</div>
            <div class="cp-power"><div><span class="kicker">Enemy power</span><b class="num">${fmt(theirs)}</b></div><div><span class="kicker">Your army</span><b class="num">${fmt(mine)}</b></div><div class="cp-odds ${odds[1]}">${odds[0]}</div></div>
            <div>${best ? '<span class="kicker">Cleared · replay for more stars and commander experience</span>' : `<span class="kicker">First victory</span>${rewardHtml(stage.reward)}`}</div>
          </div>
        </div>
        <div class="cp-foot">
          <div class="cp-cmds">${idle.length ? idle.map((c) => `<button class="cp-cmd ${c.id === cmd ? 'sel' : ''}" data-act="cmd" data-id="${c.id}" title="${esc(c.name)} · Lv.${s.commanders[c.id].level}"><span style="background-image:url(${assetUrl(c.portrait)})"></span><small>Lv.${s.commanders[c.id].level}</small></button>`).join('') : '<span class="muted">Every commander is away on a march.</span>'}</div>
          <div class="cp-go">
            <span class="muted" style="font-size:12px">${fmt(sumTroops(army))} troops · wounded recover</span>
            <button class="btn btn-gold btn-xl" data-act="fight" ${!unlocked || !cmd || s.ap < STAGE_AP || sumTroops(army) <= 0 ? 'disabled' : ''}>${ink('i_swords', 18)} ${unlocked ? 'Battle' : 'Locked'} · ${STAGE_AP} AP</button>
          </div>
        </div>`;
      onAct(body, {
        ch: (el) => {
          chapter = Number(el.dataset.n);
          const st = STAGES.filter((x) => x.chapter === chapter);
          stageId = ([...st].reverse().find((x) => stageUnlocked(ctx.game.state, x.id)) ?? st[0]).id;
          sfx.click();
          h.refresh();
        },
        stage: (el) => {
          stageId = el.dataset.id!;
          sfx.click();
          h.refresh();
        },
        cmd: (el) => {
          cmd = el.dataset.id!;
          sfx.click();
          h.refresh();
        },
        fight: () => {
          if (!cmd) return;
          const chosen = cmd;
          let outcome: ReturnType<typeof fightStage>['outcome'];
          const ok = ctx.run((st) => {
            const r = fightStage(st, stageId, chosen, autoArmy(st, chosen));
            outcome = r.outcome;
            return r;
          });
          if (!ok || !outcome) return;
          const o = outcome;
          playBattle(o.report);
          // the verdict lands after the replay; mirror it in a toast for the record
          setTimeout(() => toast(o.win ? `${STAGE_BY_ID[stageId].title} · ${o.stars} ${o.stars === 1 ? 'star' : 'stars'}${o.firstClear ? ' · first victory' : ''}` : `${STAGE_BY_ID[stageId].title} · defeat`, o.win ? 'good' : 'bad', STAGE_BY_ID[stageId].enemy.portrait), 1200);
        },
      });
    },
  });
}
