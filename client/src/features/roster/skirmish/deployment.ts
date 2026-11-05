import type { WarcryDeployment } from './types';

/** Только точки начальной расстановки: RND2/RND3 прибывают позже и не получают начальную зону. */
export const initialWarcryDeploymentPoints = (deployment: WarcryDeployment) => deployment.points.filter((point) => point.reserve === null);
