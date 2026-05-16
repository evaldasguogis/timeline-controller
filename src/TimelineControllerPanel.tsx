import React from 'react';
import { GrafanaTheme2, PanelProps } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { TimelineControllerOptions } from 'types';

type Props = PanelProps<TimelineControllerOptions>;

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: ${theme.colors.text.secondary};
    font-style: italic;
  `,
});

export const TimelineControllerPanel: React.FC<Props> = () => {
  const styles = useStyles2(getStyles);
  return <div className={styles.wrapper}>Timeline Controller (skeleton)</div>;
};
