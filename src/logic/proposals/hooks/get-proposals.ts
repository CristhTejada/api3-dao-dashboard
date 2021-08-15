import { BigNumber, providers } from 'ethers';
import { ProposalType, VoterState } from '../../../chain-data';
import { Convenience } from '../../../generated-contracts';
import { Proposal } from '../../../chain-data';
import { decodeMetadata } from '../encoding';
import { blockTimestampToDate, go, GO_RESULT_INDEX, isGoSuccess } from '../../../utils';
import { EPOCH_LENGTH, HUNDRED_PERCENT, isZeroAddress } from '../../../contracts';
import { StartVoteProposal, VOTING_APP_IDS } from './commons';

const toPercent = (value: BigNumber) => value.mul(100).div(HUNDRED_PERCENT).toNumber();

export const getProposals = async (
  provider: providers.Web3Provider,
  convenience: Convenience,
  userAccount: string,
  startVoteProposals: StartVoteProposal[],
  openVoteIds: BigNumber[],
  type: ProposalType
): Promise<Proposal[]> => {
  // NOTE: For now, let's skip the invalid proposals. Later we can do something more clever about it
  const validStartVoteProposals = startVoteProposals.filter((p) => decodeMetadata(p.metadata) !== null);

  const startVotesInfo = validStartVoteProposals.map((p) => {
    const metadata = decodeMetadata(p.metadata)!;
    return {
      ...p,
      metadata,
    };
  });

  const votingTime = EPOCH_LENGTH;
  const voteIdsToLoad = startVotesInfo.map((log) => log.voteId);
  const openVoteIdsStr = openVoteIds.map((id) => id.toString());
  const staticVoteData = await convenience.getStaticVoteData(VOTING_APP_IDS[type], userAccount, voteIdsToLoad);
  const dynamicVoteData = await convenience.getDynamicVoteData(VOTING_APP_IDS[type], userAccount, voteIdsToLoad);

  const proposals: Proposal[] = [];
  for (let i = 0; i < validStartVoteProposals.length; i++) {
    // NOTE: TS types for this are incorrect. The function returns null if the ENS record doesn't exist. Also, we wrap
    // this in go, because we don't want the proposal fetching to throw in case of lookupAddress error (also ENS is not
    // available on localhost).
    const goLookupAddress = await go(provider.lookupAddress(startVotesInfo[i]!.creator));

    proposals.push({
      type,
      ...startVotesInfo[i]!,
      open: openVoteIdsStr.includes(startVotesInfo[i]!.voteId.toString()),
      creatorName: isGoSuccess(goLookupAddress) ? goLookupAddress[GO_RESULT_INDEX] : null,

      startDate: blockTimestampToDate(staticVoteData.startDate[i]!),
      supportRequired: toPercent(staticVoteData.supportRequired[i]!),
      minAcceptQuorum: toPercent(staticVoteData.minAcceptQuorum[i]!),
      votingPower: staticVoteData.votingPower[i]!,
      deadline: blockTimestampToDate(staticVoteData.startDate[i]!.add(votingTime)),
      startDateRaw: staticVoteData.startDate[i]!,
      script: staticVoteData.script[i]!,
      userVotingPowerAt: staticVoteData.userVotingPowerAt[i]!,

      delegateAt: isZeroAddress(dynamicVoteData.delegateAt[i]!) ? null : dynamicVoteData.delegateAt[i]!,
      delegateState: dynamicVoteData.delegateState[i] as VoterState,
      voterState: dynamicVoteData.voterState[i] as VoterState,
      executed: dynamicVoteData.executed[i]!,
      yea: dynamicVoteData.yea[i]!,
      nay: dynamicVoteData.nay[i]!,
    });
  }

  return proposals;
};
