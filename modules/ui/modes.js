import _debounce from 'lodash-es/debounce';

import { select as d3_select } from 'd3-selection';

import {
    modeAddArea,
    modeAddLine,
    modeAddPoint,
    modeAddNote,
    modeBrowse
} from '../modes';

import { svgIcon } from '../svg';
import { t } from '../util/locale';
import { tooltip } from '../util/tooltip';
import { uiPresetIcon } from './preset_icon';
import { uiTooltipHtml } from './tooltipHtml';

export function uiModes(context) {
    var modes = [
        modeAddPoint(context),
        modeAddLine(context),
        modeAddArea(context),
        modeAddNote(context)
    ];


    function enabled(d) {
        if (d.id === 'add-note') {
            return notesEnabled() && notesEditable();
        } else {
            return osmEditable();
        }
    }

    function osmEditable() {
        var mode = context.mode();
        return context.editable() && mode && mode.id !== 'save';
    }

    function notesEnabled() {
        var noteLayer = context.layers().layer('notes');
        return noteLayer && noteLayer.enabled();
    }

    function notesEditable() {
        var mode = context.mode();
        return context.map().notesEditable() && mode && mode.id !== 'save';
    }


    return function(selection) {
        context
            .on('enter.editor', function(entered) {
                selection.selectAll('button.add-button')
                    .classed('active', function(mode) { return entered.button === mode.button; });
                context.container()
                    .classed('mode-' + entered.id, true);
            });

        context
            .on('exit.editor', function(exited) {
                context.container()
                    .classed('mode-' + exited.id, false);
            });

        modes.forEach(function(mode) {
            context.keybinding().on(mode.key, function() {
                if (!enabled(mode)) return;

                if (mode.id === context.mode().id) {
                    context.enter(modeBrowse(context));
                } else {
                    context.enter(mode);
                }
            });
        });


        var debouncedUpdate = _debounce(update, 500, { leading: true, trailing: true });

        context.map()
            .on('move.modes', debouncedUpdate)
            .on('drawn.modes', debouncedUpdate);

        context
            .on('enter.modes', update)
            .on('favoritePreset.modes', update);

        update();


        function update() {
            var showNotes = notesEnabled();
            var data = showNotes ? modes : modes.slice(0, 3);

            // add favorite presets to modes
            var favoritePresets = context.getFavoritePresets();
            var favoriteModes = favoritePresets.map(function(d) {
                var preset = context.presets().item(d.id);
                var isMaki = /^maki-/.test(preset.icon);
                var icon = '#' + preset.icon + (isMaki ? '-11' : '');
                var markerClass = 'add-preset add-' + d.geom + ' add-preset-' + preset.name()
                    .replace(/\s+/g, '_')
                    + '-' + d.geom; //replace spaces with underscores to avoid css interpretation
                var presetName = t('presets.presets.' + preset.id + '.name');
                var relevantMatchingGeometry = preset.geometry.filter(function(geometry) {
                    return ['point', 'line', 'area'].indexOf(geometry) !== -1;
                });
                var tooltipTitleID = 'modes.add_preset.title';
                if (relevantMatchingGeometry.length !== 1) {
                    tooltipTitleID = 'modes.add_preset.' + d.geom + '.title';
                }
                var favoriteMode = {
                    id: markerClass,
                    button: markerClass,
                    title: presetName,
                    description: t(tooltipTitleID, { feature: presetName }),
                    key: '',
                    icon: icon,
                    preset: preset,
                    geometry: d.geom
                };
                switch (d.geom) {
                    case 'point':
                    case 'vertex':
                        return modeAddPoint(context, favoriteMode);
                    case 'line':
                        return modeAddLine(context, favoriteMode);
                    case 'area':
                        return modeAddArea(context, favoriteMode);
                }
            });

            data = data.concat(favoriteModes);

            var buttons = selection.selectAll('button.add-button')
                .data(data, function(d) { return d.id; });

            // exit
            buttons.exit()
                .remove();

            // enter
            var buttonsEnter = buttons.enter()
                .append('button')
                .attr('tabindex', -1)
                .attr('class', function(d) { return d.id + ' add-button'; })
                .on('click.mode-buttons', function(d) {
                    if (!enabled(d)) return;

                    // When drawing, ignore accidental clicks on mode buttons - #4042
                    var currMode = context.mode().id;
                    if (/^draw/.test(currMode)) return;

                    if (d.id === currMode) {
                        context.enter(modeBrowse(context));
                    } else {
                        context.enter(d);
                    }
                })
                .call(tooltip()
                    .placement('bottom')
                    .html(true)
                    .title(function(d) { return uiTooltipHtml(d.description, d.key); })
                );

            buttonsEnter
                .each(function(d) {
                    if (d.preset) {
                        d3_select(this)
                            .call(uiPresetIcon()
                                .geometry(d.geometry)
                                .preset(d.preset)
                                .sizeClass('small')
                            );
                    } else {
                        d3_select(this)
                            .call(svgIcon(d.icon || '#iD-icon-' + d.button));
                    }
                });

            buttonsEnter
                .append('span')
                .attr('class', 'label')
                .text(function(mode) { return mode.title; });

            // if we are adding/removing the buttons, check if toolbar has overflowed
            if (buttons.enter().size() || buttons.exit().size()) {
                context.ui().checkOverflow('#bar', true);
            }

            // update
            buttons = buttons
                .merge(buttonsEnter)
                .classed('disabled', function(d) { return !enabled(d); });
        }
    };
}
